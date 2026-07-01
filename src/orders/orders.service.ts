import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import {
  InventoryOwnerType,
  OrderStatus,
  PromotionLevel,
  UserRole,
} from "@prisma/client";
import { InventoryService } from "../inventory/inventory.service";

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private stockService: InventoryService,
  ) {}

  private async getPharmacistProfileId(userId: string) {
    const profile = await this.prisma.pharmacistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException("Pharmacist profile not found");
    return profile;
  }
  private async getPharmacistProfile(userId: string) {
    const profile = await this.prisma.pharmacistProfile.findUnique({
      where: { userId },
      select: { id: true ,areaId:true,address:true,pharmacyName:true},
    });
    if (!profile) throw new NotFoundException("Pharmacist profile not found");
    return profile;
  }

  private async getDistributorProfile(userId: string) {
    const profile = await this.prisma.distributorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException("Distributor profile not found");
    return profile;
  }

  private generateOrderNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 99999)
      .toString()
      .padStart(5, "0");
    return `ORD-${year}-${random}`;
  }

  async create(userId: string, dto: CreateOrderDto) {
    const pharmacist = await this.getPharmacistProfile(userId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cityId: true },
    });
    if (!user?.cityId) throw new BadRequestException("User city is not set");

    const distributorId = dto.distributorId;

    // تجهيز البيانات لكل item مع جلب معلومات المنتج
    const orderItemsData = (
      await Promise.all(
        dto.items.map(async (item) => {
          const product = await this.prisma.product.findUnique({
            where: { id: item.productId },
            select: {
              id: true,
              companyId: true,
              distributorToPharmacistPrice: true,
              nameAr: true,
              status: true,
            },
          });
          if (!product)
            throw new NotFoundException(`Product ${item.productId} not found`);
          if (product.status !== "active")
            throw new BadRequestException(
              `Product ${product.nameAr} is not active`,
            );

          const unitPrice = Number(product.distributorToPharmacistPrice);
          const discountAmount = await this.calculatePercentageDiscount(
            item.promotionProductId,
            item.productId,
            product.companyId,
            distributorId,
            unitPrice,
            item.quantity,
          );

          const orderItem = {
            productId: item.productId,
            productName: product.nameAr,
            quantity: item.quantity,
            unitPrice,
            promotionProductId: item.promotionProductId ?? null,
            discountAmount,
            subtotal: unitPrice * item.quantity - discountAmount,
          };

          const freeItem = await this.createBuyXGetYFreeItem(
            item.promotionBuyXGetYId,
            item.productId,
            product.companyId,
            distributorId,
            item.quantity,
          );

          return freeItem ? [orderItem, freeItem] : [orderItem];
        }),
      )
    ).flat();

    const totalAmount = orderItemsData.reduce(
      (sum, i) => sum + i.subtotal,
      0,
    );

    await this.assertDistributorStockAvailable(distributorId, orderItemsData);

    const order = await this.prisma.order.create({
      data: {
        orderNumber: this.generateOrderNumber(),
        pharmacistId: pharmacist.id,
        cityId: user.cityId,
        areaId: pharmacist.areaId,
        deliveryAddress: pharmacist.address,
        distributorId,
        // areaId: dto.areaId,
        paymentMethod: dto.paymentMethod,
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
    });

    return order;
  }

  private async assertDistributorStockAvailable(
    distributorId: string,
    items: { productId: string; quantity: number }[],
  ) {
    const requiredByProduct = this.groupRequiredQuantities(items);

    for (const [productId, quantity] of requiredByProduct) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { distributorId_productId: { distributorId, productId } },
        select: { quantityAvailable: true },
      });

      if (!inventory || inventory.quantityAvailable < quantity) {
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

    for (const item of items) {
      requiredByProduct.set(
        item.productId,
        (requiredByProduct.get(item.productId) ?? 0) + item.quantity,
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
    if (!promotionProductId) return 0;

    const promo = await this.prisma.promotionProduct.findUnique({
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
    });
    if (!promo || promo.productId !== productId) return 0;

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
      ? (unitPrice * quantity * Number(promo.discountPercent)) / 100
      : 0;
  }

  private async createBuyXGetYFreeItem(
    promotionBuyXGetYId: string | undefined,
    productId: string,
    companyId: string,
    distributorId: string | null,
    quantity: number,
  ) {
    if (!promotionBuyXGetYId) return null;

    const promo = await this.prisma.promotionBuyXGetY.findUnique({
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
    });
    if (!promo || promo.buyProductId !== productId) return null;

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

    if (!isValid || quantity < promo.buyQuantity) return null;

    const freeQuantity =
      Math.floor(quantity / promo.buyQuantity) * promo.freeQuantity;
    const unitPrice = Number(promo.freeProduct.distributorToPharmacistPrice);

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

  async findAll(userId: string, role: UserRole) {
    const where: any = {};

    if (role === UserRole.pharmacist) {
      const profile = await this.getPharmacistProfileId(userId);
      where.pharmacistId = profile.id;
    } else if (role === UserRole.distributor) {
      const profile = await this.getDistributorProfile(userId);
      where.distributorId = profile.id;
    }
    // admin يشوف الكل

    return this.prisma.order.findMany({
      where,
      include: { orderItems: true, city: { select: { nameAr: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string, userId: string, role: UserRole) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: { product: { select: { nameAr: true, imageUrl: true } } },
        },
        pharmacist: { select: { pharmacyName: true } },
        distributor: { select: { companyName: true } },
        city: { select: { nameAr: true } },
      },
    });
    if (!order) throw new NotFoundException("Order not found");

    // التحقق من الصلاحية
    if (role === UserRole.pharmacist) {
      const profile = await this.getPharmacistProfileId(userId);
      if (order.pharmacistId !== profile.id) throw new ForbiddenException();
    } else if (role === UserRole.distributor) {
      const profile = await this.getDistributorProfile(userId);
      if (order.distributorId !== profile.id) throw new ForbiddenException();
    }

    return order;
  }

  async updateStatus(
    id: string,
    userId: string,
    role: UserRole,
    dto: UpdateOrderStatusDto,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException("Order not found");

    this.validateStatusTransition(order.status, dto.status, role, userId);

    if (role === UserRole.distributor) {
      const profile = await this.getDistributorProfile(userId);
      if (order.distributorId !== profile.id) throw new ForbiddenException();
    }

    if (role === UserRole.pharmacist) {
      const profile = await this.getPharmacistProfileId(userId);
      if (order.pharmacistId !== profile.id) throw new ForbiddenException();
    }

    if (dto.status === OrderStatus.rejected && !dto.rejectionReason) {
      throw new BadRequestException("Rejection reason is required");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.rejectionReason && { rejectionReason: dto.rejectionReason }),
          ...(dto.status === OrderStatus.approved && {
            approvedAt: new Date(),
          }),
          ...(dto.status === OrderStatus.delivered && {
            deliveredAt: new Date(),
          }),
        },
        include: { orderItems: true },
      });

      if (dto.status === OrderStatus.approved && order.distributorId) {
        await this.stockService.transferForOrder(
          {
            ownerType: InventoryOwnerType.distributor,
            ownerId: order.distributorId,
          },
          {
            ownerType: InventoryOwnerType.pharmacist,
            ownerId: order.pharmacistId,
          },
          id,
          updated.orderItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          userId,
          tx,
        );
      }

      if (
        dto.status === OrderStatus.cancelled &&
        order.status === OrderStatus.approved &&
        order.distributorId
      ) {
        await this.stockService.transferForOrder(
          {
            ownerType: InventoryOwnerType.pharmacist,
            ownerId: order.pharmacistId,
          },
          {
            ownerType: InventoryOwnerType.distributor,
            ownerId: order.distributorId,
          },
          id,
          updated.orderItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          userId,
          tx,
        );
      }

      return updated;
    });
  }

  private validateStatusTransition(
    current: OrderStatus,
    next: OrderStatus,
    role: UserRole,
    _userId: string,
  ) {
    const allowed: Record<
      UserRole,
      Partial<Record<OrderStatus, OrderStatus[]>>
    > = {
      [UserRole.distributor]: {
        [OrderStatus.pending]: [OrderStatus.approved, OrderStatus.rejected],
        [OrderStatus.approved]: [
          OrderStatus.in_delivery,
          OrderStatus.cancelled,
        ],
        [OrderStatus.in_delivery]: [OrderStatus.delivered],
      },
      [UserRole.pharmacist]: {
        [OrderStatus.pending]: [OrderStatus.cancelled],
      },
      [UserRole.admin]: {
        [OrderStatus.pending]: [
          OrderStatus.approved,
          OrderStatus.rejected,
          OrderStatus.cancelled,
        ],
        [OrderStatus.approved]: [
          OrderStatus.in_delivery,
          OrderStatus.cancelled,
        ],
        [OrderStatus.in_delivery]: [OrderStatus.delivered],
      },
      [UserRole.company]: {},
      [UserRole.doctor]: {},
      [UserRole.representative]: {},
      [UserRole.delivery_staff]: {},
    };

    const allowedNext = allowed[role]?.[current] ?? [];
    if (!allowedNext.includes(next)) {
      throw new BadRequestException(
        `Cannot transition from ${current} to ${next}`,
      );
    }
  }
}
