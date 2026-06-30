import {
    Injectable,
    NotFoundException,
    BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import {
    PromotionLevel,
} from "@prisma/client";
import { InventoryService } from "../inventory/inventory.service";

@Injectable()
export class newOrderServices {
    constructor (
        private prisma: PrismaService,
        private stockService: InventoryService,
    ) {}

    private async getPharmacistProfile( userId: string ) {
        const profile = await this.prisma.pharmacistProfile.findUnique( {
            where: { userId },
            select: { id: true },
        } );
        if ( !profile ) throw new NotFoundException( "Pharmacist profile not found" );
        return profile;
    }

    private generateOrderNumber(): string {
        const year = new Date().getFullYear();
        const random = Math.floor( Math.random() * 99999 )
            .toString()
            .padStart( 5, "0" );
        return `ORD-${year}-${random}`;
    }

    // تجميع الـ items حسب الشركة
    private async groupItemsByCompany( items: CreateOrderDto[ "items" ] ) {
        const groups = new Map<string, typeof items>();

        for ( const item of items ) {
            const product = await this.prisma.product.findUnique( {
                where: { id: item.productId },
                select: {
                    id: true,
                    companyId: true,
                    distributorToPharmacistPrice: true,
                    nameAr: true,
                    status: true,
                },
                // select: { id: true, companyId: true, nameAr: true, status: true },
            } );
            if ( !product )
                throw new NotFoundException( `Product ${item.productId} not found` );
            if ( product.status !== "active" )
                throw new BadRequestException(
                    `Product ${product.nameAr} is not active`,
                );

            const existing = groups.get( product.companyId ) ?? [];
            existing.push( { ...item, _product: product } as any );
            groups.set( product.companyId, existing );
        }

        return groups;
    }

    // إيجاد الموزع المناسب
    private async findDistributor(
        companyId: string,
        cityId: string,
    ): Promise<string | null> {
        const cd = await this.prisma.companyDistributor.findFirst( {
            where: { companyId, cityId, status: "active" },
            select: { distributorId: true },
        } );
        return cd?.distributorId ?? null;
    }

    async create( userId: string, dto: CreateOrderDto ) {
        const pharmacist = await this.getPharmacistProfile( userId );
        
        const user = await this.prisma.user.findUnique( {
            where: { id: userId },
            select: { cityId: true },
        });
        if ( !user?.cityId ) throw new BadRequestException( "User city is not set" );

        const groups = await this.groupItemsByCompany( dto.items );
        const createdOrders: any[] = [];

        for ( const [ companyId, items ] of groups ) {
            const distributorId = await this.findDistributor( companyId, user.cityId );
            if ( !distributorId ) {
                throw new BadRequestException(
                    "No active distributor found for this company in user city",
                );
            }

            // حساب الـ items مع الخصومات
            const orderItemsData = (
                await Promise.all(
                    items.map( async ( item: any ) => {
                        const unitPrice = Number(
                            item._product.distributorToPharmacistPrice,
                        );
                        const discountAmount = await this.calculatePercentageDiscount(
                            item.promotionProductId,
                            item.productId,
                            companyId,
                            distributorId,
                            unitPrice,
                            item.quantity,
                        );

                        const orderItem = {
                            productId: item.productId,
                            productName: item._product.nameAr,
                            quantity: item.quantity,
                            unitPrice,
                            promotionProductId: item.promotionProductId ?? null,
                            discountAmount,
                            subtotal: unitPrice * item.quantity - discountAmount,
                        };

                        const freeItem = await this.createBuyXGetYFreeItem(
                            item.promotionBuyXGetYId,
                            item.productId,
                            companyId,
                            distributorId,
                            item.quantity,
                        );

                        return freeItem ? [ orderItem, freeItem ] : [ orderItem ];
                    } ),
                )
            ).flat();

            const totalAmount = orderItemsData.reduce(
                ( sum, i ) => sum + i.subtotal,
                0,
            );

            await this.assertDistributorStockAvailable( distributorId, orderItemsData );

            const order = await this.prisma.order.create( {
                data: {
                    orderNumber: this.generateOrderNumber(),
                    pharmacistId: pharmacist.id,
                    companyId,
                    distributorId,
                    cityId: user.cityId,
                    paymentMethod: dto.paymentMethod,
                    deliveryAddress: dto.deliveryAddress,
                    notes: dto.notes,
                    totalAmount,
                    orderItems: {
                        create: orderItemsData,
                    },
                },
                include: {
                    orderItems: true,
                    distributor: { select: { companyName: true } },
                },
            } );

            createdOrders.push( order );
        }

        return createdOrders.length === 1 ? createdOrders[ 0 ] : createdOrders;
    }

    private async assertDistributorStockAvailable(
        distributorId: string,
        items: { productId: string; quantity: number }[],
    ) {
        const requiredByProduct = this.groupRequiredQuantities( items );

        for ( const [ productId, quantity ] of requiredByProduct ) {
            const inventory = await this.prisma.inventory.findUnique( {
                where: { distributorId_productId: { distributorId, productId } },
                select: { quantityAvailable: true },
            } );

            if ( !inventory || inventory.quantityAvailable < quantity ) {
                throw new BadRequestException(
                    `Insufficient distributor stock for product ${productId}`,
                );
            }
        }
    }

    private groupRequiredQuantities(
        items: { productId: string; quantity: number }[],
    ) {
        const requiredByProduct = new Map<string, number>();

        for ( const item of items ) {
            requiredByProduct.set(
                item.productId,
                ( requiredByProduct.get( item.productId ) ?? 0 ) + item.quantity,
            );
        }

        return requiredByProduct;
    }

    private async calculatePercentageDiscount(
        promotionProductId: string | undefined,
        productId: string,
        companyId: string,
        distributorId: string | null,
        unitPrice: number,
        quantity: number,
    ) {
        if ( !promotionProductId ) return 0;

        const promo = await this.prisma.promotionProduct.findUnique( {
            where: { id: promotionProductId },
            select: {
                discountPercent: true,
                productId: true,
                promotion: {
                    select: {
                        companyId: true,
                        distributorId: true,
                        level: true,
                        isActive: true,
                        startsAt: true,
                        endsAt: true,
                    },
                },
            },
        } );
        if ( !promo || promo.productId !== productId ) return 0;

        const promotion = promo.promotion;
        const now = new Date();
        const appliesToDistributor =
            !promotion.distributorId || promotion.distributorId === distributorId;
        const isValid =
            promotion.companyId === companyId &&
            promotion.level === PromotionLevel.pharmacist &&
            promotion.isActive &&
            now >= promotion.startsAt &&
            now <= promotion.endsAt &&
            appliesToDistributor;

        return isValid
            ? ( unitPrice * quantity * Number( promo.discountPercent ) ) / 100
            : 0;
    }

    private async createBuyXGetYFreeItem(
        promotionBuyXGetYId: string | undefined,
        productId: string,
        companyId: string,
        distributorId: string | null,
        quantity: number,
    ) {
        if ( !promotionBuyXGetYId ) return null;

        const promo = await this.prisma.promotionBuyXGetY.findUnique( {
            where: { id: promotionBuyXGetYId },
            select: {
                buyProductId: true,
                buyQuantity: true,
                freeQuantity: true,
                freeProduct: {
                    select: {
                        id: true,
                        companyId: true,
                        nameAr: true,
                        status: true,
                        distributorToPharmacistPrice: true,
                    },
                },
                promotion: {
                    select: {
                        companyId: true,
                        distributorId: true,
                        level: true,
                        isActive: true,
                        startsAt: true,
                        endsAt: true,
                    },
                },
            },
        } );
        if ( !promo || promo.buyProductId !== productId ) return null;

        const promotion = promo.promotion;
        const now = new Date();
        const appliesToDistributor =
            !promotion.distributorId || promotion.distributorId === distributorId;
        const isValid =
            promotion.companyId === companyId &&
            promotion.level === PromotionLevel.pharmacist &&
            promotion.isActive &&
            now >= promotion.startsAt &&
            now <= promotion.endsAt &&
            appliesToDistributor &&
            promo.freeProduct.companyId === companyId &&
            promo.freeProduct.status === "active";

        if ( !isValid || quantity < promo.buyQuantity ) return null;

        const freeQuantity =
            Math.floor( quantity / promo.buyQuantity ) * promo.freeQuantity;
        const unitPrice = Number( promo.freeProduct.distributorToPharmacistPrice );

        return {
            productId: promo.freeProduct.id,
            productName: promo.freeProduct.nameAr,
            quantity: freeQuantity,
            unitPrice,
            promotionProductId: null,
            discountAmount: unitPrice * freeQuantity,
            subtotal: 0,
        };
    }

}
