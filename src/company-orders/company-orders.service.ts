import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InventoryOwnerType,
  OrderStatus,
  PromotionLevel,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryService } from "../inventory/inventory.service";
import { CreateCompanyOrderDto } from "./dto/create-company-order.dto";
import { UpdateCompanyOrderStatusDto } from "./dto/update-company-order-status.dto";

@Injectable()
export class CompanyOrdersService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
  ) {}

  private async getCompanyProfile(userId: string) {
    const profile = await this.prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException("Company profile not found");
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
    return `CDO-${year}-${random}`;
  }

  async create(userId: string, dto: CreateCompanyOrderDto) {
    const distributor = await this.getDistributorProfile(userId);

    const linked = await this.prisma.companyDistributor.findFirst({
      where: {
        distributorId: distributor.id,
        companyId: dto.companyId,
        status: "active",
      },
    });
    if (!linked)
      throw new BadRequestException(
        "Distributor is not linked to this company",
      );

    const orderItemsData = (
      await Promise.all(
        dto.items.map(async (item) => {
          const product = await this.prisma.product.findFirst({
            where: { id: item.productId, companyId: dto.companyId },
            select: {
              id: true,
              nameAr: true,
              status: true,
              companyToDistributorPrice: true,
            },
          });
          if (!product)
            throw new NotFoundException(
              `Product ${item.productId} not found for this company`,
            );
          if (product.status !== "active") {
            throw new BadRequestException(
              `Product ${product.nameAr} is not active`,
            );
          }

          const unitPrice = Number(product.companyToDistributorPrice);
          const discountAmount = await this.calculateDiscount(
            item.promotionProductId,
            item.productId,
            dto.companyId,
            distributor.id,
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
            dto.companyId,
            distributor.id,
            item.quantity,
          );

          return freeItem ? [orderItem, freeItem] : [orderItem];
        }),
      )
    ).flat();

    const totalAmount = orderItemsData.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    await this.assertCompanyStockAvailable(dto.companyId, orderItemsData);

    return this.prisma.companyDistributorOrder.create({
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
    });
  }

  async findAll(userId: string, role: UserRole) {
    const where: any = {};

    if (role === UserRole.company) {
      const profile = await this.getCompanyProfile(userId);
      where.companyId = profile.id;
    } else if (role === UserRole.distributor) {
      const profile = await this.getDistributorProfile(userId);
      where.distributorId = profile.id;
    }

    return this.prisma.companyDistributorOrder.findMany({
      where,
      include: {
        orderItems: true,
        company: { select: { companyName: true } },
        distributor: { select: { companyName: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string, userId: string, role: UserRole) {
    const order = await this.prisma.companyDistributorOrder.findUnique({
      where: { id },
      include: {
        orderItems: {
          include: { product: { select: { nameAr: true, imageUrl: true } } },
        },
        company: { select: { companyName: true } },
        distributor: { select: { companyName: true } },
      },
    });
    if (!order) throw new NotFoundException("Company order not found");

    await this.assertOrderAccess(
      order.companyId,
      order.distributorId,
      userId,
      role,
    );
    return order;
  }

  async updateStatus(
    id: string,
    userId: string,
    role: UserRole,
    dto: UpdateCompanyOrderStatusDto,
  ) {
    const order = await this.prisma.companyDistributorOrder.findUnique({
      where: { id },
    });
    if (!order) throw new NotFoundException("Company order not found");

    await this.assertOrderAccess(
      order.companyId,
      order.distributorId,
      userId,
      role,
    );
    this.validateStatusTransition(order.status, dto.status, role);

    if (dto.status === OrderStatus.rejected && !dto.rejectionReason) {
      throw new BadRequestException("Rejection reason is required");
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.companyDistributorOrder.update({
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

      if (dto.status === OrderStatus.approved) {
        await this.inventoryService.decreaseForOrder(
          { ownerType: InventoryOwnerType.company, ownerId: order.companyId },
          id,
          updated.orderItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
          userId,
          tx,
        );
      }

      if (dto.status === OrderStatus.delivered) {
        await this.inventoryService.increaseForOrder(
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

      if (
        dto.status === OrderStatus.cancelled &&
        order.status === OrderStatus.approved
      ) {
        await this.inventoryService.increaseForOrder(
          { ownerType: InventoryOwnerType.company, ownerId: order.companyId },
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

  private async assertCompanyStockAvailable(
    companyId: string,
    items: { productId: string; quantity: number }[],
  ) {
    const requiredByProduct = this.groupRequiredQuantities(items);

    for (const [productId, quantity] of requiredByProduct) {
      const inventory = await this.prisma.inventory.findUnique({
        where: { companyId_productId: { companyId, productId } },
        select: { quantityAvailable: true },
      });

      if (!inventory || inventory.quantityAvailable < quantity) {
        throw new BadRequestException(
          `Insufficient company stock for product ${productId}`,
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

  private async calculateDiscount(
    promotionProductId: string | undefined,
    productId: string,
    companyId: string,
    distributorId: string,
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
      promotion.level === PromotionLevel.distributor &&
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
    distributorId: string,
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
            companyToDistributorPrice: true,
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
      promotion.level === PromotionLevel.distributor &&
      promotion.isActive &&
      now >= promotion.startsAt &&
      now <= promotion.endsAt &&
      appliesToDistributor &&
      promo.freeProduct.companyId === companyId &&
      promo.freeProduct.status === "active";

    if (!isValid || quantity < promo.buyQuantity) return null;

    const freeQuantity =
      Math.floor(quantity / promo.buyQuantity) * promo.freeQuantity;
    const unitPrice = Number(promo.freeProduct.companyToDistributorPrice);

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

  private async assertOrderAccess(
    companyId: string,
    distributorId: string,
    userId: string,
    role: UserRole,
  ) {
    if (role === UserRole.company) {
      const profile = await this.getCompanyProfile(userId);
      if (companyId !== profile.id) throw new ForbiddenException();
    } else if (role === UserRole.distributor) {
      const profile = await this.getDistributorProfile(userId);
      if (distributorId !== profile.id) throw new ForbiddenException();
    }
  }

  private validateStatusTransition(
    current: OrderStatus,
    next: OrderStatus,
    role: UserRole,
  ) {
    const allowed: Record<
      UserRole,
      Partial<Record<OrderStatus, OrderStatus[]>>
    > = {
      [UserRole.company]: {
        [OrderStatus.pending]: [OrderStatus.approved, OrderStatus.rejected],
        [OrderStatus.approved]: [
          OrderStatus.in_delivery,
          OrderStatus.cancelled,
        ],
        [OrderStatus.in_delivery]: [OrderStatus.delivered],
      },
      [UserRole.distributor]: {
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
      [UserRole.pharmacist]: {},
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
