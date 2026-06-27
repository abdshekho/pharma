import {
    BadRequestException,
    ForbiddenException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { InventoryOwnerType, OrderStatus, PromotionLevel, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateCompanyOrderDto } from './dto/create-company-order.dto';
import { UpdateCompanyOrderStatusDto } from './dto/update-company-order-status.dto';

@Injectable()
export class CompanyOrdersService {
    constructor (
        private prisma: PrismaService,
        private inventoryService: InventoryService,
    ) {}

    private async getCompanyProfile( userId: string ) {
        const profile = await this.prisma.companyProfile.findUnique( {
            where: { userId },
            select: { id: true },
        } );
        if ( !profile ) throw new NotFoundException( 'Company profile not found' );
        return profile;
    }

    private async getDistributorProfile( userId: string ) {
        const profile = await this.prisma.distributorProfile.findUnique( {
            where: { userId },
            select: { id: true },
        } );
        if ( !profile ) throw new NotFoundException( 'Distributor profile not found' );
        return profile;
    }

    private generateOrderNumber(): string {
        const year = new Date().getFullYear();
        const random = Math.floor( Math.random() * 99999 ).toString().padStart( 5, '0' );
        return `CDO-${year}-${random}`;
    }

    async create( userId: string, dto: CreateCompanyOrderDto ) {
        const distributor = await this.getDistributorProfile( userId );

        const linked = await this.prisma.companyDistributor.findFirst( {
            where: {
                distributorId: distributor.id,
                companyId: dto.companyId,
                status: 'active',
            },
        } );
        if ( !linked ) throw new BadRequestException( 'Distributor is not linked to this company' );

        const orderItemsData = await Promise.all(
            dto.items.map( async ( item ) => {
                const product = await this.prisma.product.findFirst( {
                    where: { id: item.productId, companyId: dto.companyId },
                    select: {
                        id: true,
                        nameAr: true,
                        status: true,
                        companyToDistributorPrice: true,
                    },
                } );
                if ( !product ) throw new NotFoundException( `Product ${item.productId} not found for this company` );
                if ( product.status !== 'active' ) {
                    throw new BadRequestException( `Product ${product.nameAr} is not active` );
                }

                const unitPrice = Number( product.companyToDistributorPrice );
                const discountAmount = await this.calculateDiscount(
                    item.promotionProductId,
                    item.productId,
                    dto.companyId,
                    distributor.id,
                    unitPrice,
                    item.quantity,
                );

                return {
                    productId: item.productId,
                    productName: product.nameAr,
                    quantity: item.quantity,
                    unitPrice,
                    promotionProductId: item.promotionProductId ?? null,
                    discountAmount,
                    subtotal: unitPrice * item.quantity - discountAmount,
                };
            } ),
        );

        const totalAmount = orderItemsData.reduce( ( sum, item ) => sum + item.subtotal, 0 );

        return this.prisma.companyDistributorOrder.create( {
            data: {
                orderNumber: this.generateOrderNumber(),
                companyId: dto.companyId,
                distributorId: distributor.id,
                paymentMethod: dto.paymentMethod,
                deliveryAddress: dto.deliveryAddress,
                notes: dto.notes,
                totalAmount,
                orderItems: { create: orderItemsData },
            },
            include: {
                orderItems: true,
                company: { select: { companyName: true } },
                distributor: { select: { companyName: true } },
            },
        } );
    }

    async findAll( userId: string, role: UserRole ) {
        const where: any = {};

        if ( role === UserRole.company ) {
            const profile = await this.getCompanyProfile( userId );
            where.companyId = profile.id;
        } else if ( role === UserRole.distributor ) {
            const profile = await this.getDistributorProfile( userId );
            where.distributorId = profile.id;
        }

        return this.prisma.companyDistributorOrder.findMany( {
            where,
            include: {
                orderItems: true,
                company: { select: { companyName: true } },
                distributor: { select: { companyName: true } },
            },
            orderBy: { createdAt: 'desc' },
        } );
    }

    async findOne( id: string, userId: string, role: UserRole ) {
        const order = await this.prisma.companyDistributorOrder.findUnique( {
            where: { id },
            include: {
                orderItems: { include: { product: { select: { nameAr: true, imageUrl: true } } } },
                company: { select: { companyName: true } },
                distributor: { select: { companyName: true } },
            },
        } );
        if ( !order ) throw new NotFoundException( 'Company order not found' );

        await this.assertOrderAccess( order.companyId, order.distributorId, userId, role );
        return order;
    }

    async updateStatus(
        id: string,
        userId: string,
        role: UserRole,
        dto: UpdateCompanyOrderStatusDto,
    ) {
        const order = await this.prisma.companyDistributorOrder.findUnique( { where: { id } } );
        if ( !order ) throw new NotFoundException( 'Company order not found' );

        await this.assertOrderAccess( order.companyId, order.distributorId, userId, role );
        this.validateStatusTransition( order.status, dto.status, role );

        if ( dto.status === OrderStatus.rejected && !dto.rejectionReason ) {
            throw new BadRequestException( 'Rejection reason is required' );
        }

        return this.prisma.$transaction( async ( tx ) => {
            const updated = await tx.companyDistributorOrder.update( {
                where: { id },
                data: {
                    status: dto.status,
                    ...( dto.rejectionReason && { rejectionReason: dto.rejectionReason } ),
                    ...( dto.status === OrderStatus.approved && { approvedAt: new Date() } ),
                    ...( dto.status === OrderStatus.delivered && { deliveredAt: new Date() } ),
                },
                include: { orderItems: true },
            } );

            if ( dto.status === OrderStatus.delivered ) {
                await this.inventoryService.transferForOrder(
                    { ownerType: InventoryOwnerType.company, ownerId: order.companyId },
                    { ownerType: InventoryOwnerType.distributor, ownerId: order.distributorId },
                    id,
                    updated.orderItems.map( ( i ) => ( { productId: i.productId, quantity: i.quantity } ) ),
                    userId,
                    tx,
                );
            }

            return updated;
        } );
    }

    private async calculateDiscount(
        promotionProductId: string | undefined,
        productId: string,
        companyId: string,
        distributorId: string,
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
        const appliesToDistributor = !promotion.distributorId || promotion.distributorId === distributorId;
        const isValid =
            promotion.companyId === companyId &&
            promotion.level === PromotionLevel.distributor &&
            promotion.isActive &&
            now >= promotion.startsAt &&
            now <= promotion.endsAt &&
            appliesToDistributor;

        return isValid ? ( unitPrice * quantity * Number( promo.discountPercent ) ) / 100 : 0;
    }

    private async assertOrderAccess(
        companyId: string,
        distributorId: string,
        userId: string,
        role: UserRole,
    ) {
        if ( role === UserRole.company ) {
            const profile = await this.getCompanyProfile( userId );
            if ( companyId !== profile.id ) throw new ForbiddenException();
        } else if ( role === UserRole.distributor ) {
            const profile = await this.getDistributorProfile( userId );
            if ( distributorId !== profile.id ) throw new ForbiddenException();
        }
    }

    private validateStatusTransition( current: OrderStatus, next: OrderStatus, role: UserRole ) {
        const allowed: Record<UserRole, Partial<Record<OrderStatus, OrderStatus[]>>> = {
            [ UserRole.company ]: {
                [ OrderStatus.pending ]: [ OrderStatus.approved, OrderStatus.rejected ],
                [ OrderStatus.approved ]: [ OrderStatus.in_delivery ],
                [ OrderStatus.in_delivery ]: [ OrderStatus.delivered ],
            },
            [ UserRole.distributor ]: {
                [ OrderStatus.pending ]: [ OrderStatus.cancelled ],
            },
            [ UserRole.admin ]: {
                [ OrderStatus.pending ]: [ OrderStatus.approved, OrderStatus.rejected, OrderStatus.cancelled ],
                [ OrderStatus.approved ]: [ OrderStatus.in_delivery, OrderStatus.cancelled ],
                [ OrderStatus.in_delivery ]: [ OrderStatus.delivered ],
            },
            [ UserRole.pharmacist ]: {},
            [ UserRole.doctor ]: {},
            [ UserRole.representative ]: {},
        };

        const allowedNext = allowed[ role ]?.[ current ] ?? [];
        if ( !allowedNext.includes( next ) ) {
            throw new BadRequestException( `Cannot transition from ${current} to ${next}` );
        }
    }
}