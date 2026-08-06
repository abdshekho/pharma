import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { FindDistributorsDto } from "./dto/find-distributors.dto";
import { CheckAvailabilityDto } from "./dto/check-availability.dto";
import {
  CheckAvailabilityResponseDto,
  DistributorAvailabilityDto,
  AvailabilityItemDto,
  PromotionDto,
} from "./dto/availability-response.dto";
import {
  InventoryOwnerType,
  OrderStatus,
  PromotionLevel,
  UserRole,
  WeekDay,
  PromotionType,
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

  private async getDeliveryStaffProfile(userId: string) {
    const profile = await this.prisma.deliveryStaffProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException("Delivery staff profile not found");
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

    if(!promo) throw new NotFoundException(`promotionProductId ${promotionProductId} not found`);
    if (promo.productId !== productId) throw new BadRequestException(`ProductId ${productId}  not found in promotionProductId ${promotionProductId}`);
    // if (!promo || promo.productId !== productId) return 0;

    const promotion = promo.promotion;

    const now = new Date();
      if(now >= promotion.endsAt) throw new BadRequestException('Promotion has expired')
      if(now <= promotion.startsAt) throw new BadRequestException('Promotion has not started yet')

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
          // where :{isActive: true},
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
    // if (!promo || promo.buyProductId !== productId) return null;
    if(!promo) throw new NotFoundException(`promotionBuyXGetYId ${promotionBuyXGetYId} not found`);
    if (promo.buyProductId !== productId) throw new BadRequestException(`promotionBuyXGetYId ${promotionBuyXGetYId} don't have productId ${productId}`);


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

    // if (!isValid || quantity < promo.buyQuantity) return null;
    if(quantity < promo.buyQuantity) throw new BadRequestException(`promotionBuyXGetYId ${promotionBuyXGetYId} not valid for quantity ${quantity}`);
    if(!isValid) throw new NotFoundException(`promotionBuyXGetYId ${promotionBuyXGetYId} not valid`);

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

  async findAll(userId: string, role: UserRole, status?: string) {
    const where: any = {};

    if (role === UserRole.pharmacist) {
      const profile = await this.getPharmacistProfileId(userId);
      where.pharmacistId = profile.id;
    } else if (role === UserRole.distributor) {
      const profile = await this.getDistributorProfile(userId);
      where.distributorId = profile.id;
    } else if (role === UserRole.delivery_staff) {
      const profile = await this.getDeliveryStaffProfile(userId);
      where.deliveryStaffId = profile.id;
    }
    // admin يشوف الكل

    // فلترة حسب الحالة إذا تم توفيرها
    if (status) {
      where.status = status;
    }

    return this.prisma.order.findMany({
      where,
      include: {
        orderItems: {
          include: { product: { select: { imageUrl: true } } },
        },
        pharmacist: { select: { pharmacyName: true } },
        distributor: { select: { companyName: true } },
        deliveryStaff: { select: { id: true, user: { select: { fullName: true } } } },
        city: { select: { nameAr: true } },
      },
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
        deliveryStaff: { select: { id: true, user: { select: { fullName: true } } } },
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
    } else if (role === UserRole.delivery_staff) {
      const profile = await this.getDeliveryStaffProfile(userId);
      if (order.deliveryStaffId !== profile.id) throw new ForbiddenException();
    }

    return order;
  }


    async updateAssign(
    id: string,
    userId: string,
    role: UserRole,
    deliveryStaffId?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
    });
    if(!order) throw new NotFoundException("Order not found");
    if(order?.status !== OrderStatus.approved) {
      throw new BadRequestException("Order should be approved first to assign delivery staff");
    }

      const distributorProfile = await this.getDistributorProfile(userId);
      if (order.distributorId !== distributorProfile.id) throw new ForbiddenException('Distributor profile not found');


    const profileStaffValid = await this.prisma.deliveryStaffProfile.findUnique({
      where: { id: deliveryStaffId ,distributorId:order?.distributorId },
    })
    if(!profileStaffValid) {
      throw new BadRequestException("Delivery staff not found");
    }
    if (!order) throw new NotFoundException("Company order not found");


    return this.prisma.order.update({
      where: { id },
      data: {
        deliveryStaffId,
      },
    });
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

    if (role === UserRole.delivery_staff) {
      const profile = await this.getDeliveryStaffProfile(userId);
      if (order.deliveryStaffId !== profile.id) throw new ForbiddenException();
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

  async checkAvailability(dto: CheckAvailabilityDto): Promise<CheckAvailabilityResponseDto> {
    const results: DistributorAvailabilityDto[] = [];
    const now = new Date();

    for (const distributorId of dto.distributorIds) {
      const distributor = await this.prisma.distributorProfile.findUnique({
        where: { id: distributorId },
        select: { id: true, companyName: true },
      });

      if (!distributor) continue;

      const availableItems: AvailabilityItemDto[] = [];
      const missingProducts: string[] = [];
      let availableCount = 0;
      const promotions: PromotionDto[] = [];

      for (const item of dto.items) {
        const inventory = await this.prisma.inventory.findUnique({
          where: { distributorId_productId: { distributorId, productId: item.productId } },
          select: { quantityAvailable: true },
        });

        const stock = inventory?.quantityAvailable || 0;
        const available = stock >= item.quantity;
        
        if (available) {
          availableCount++;
        } else {
          missingProducts.push(item.productId);
        }

        // جلب العروض المتاحة للمنتج
        const productPromotions = await this.getProductPromotions(item.productId, distributorId, now);
        
        availableItems.push({
          productId: item.productId,
          available,
          stock,
          promotions: productPromotions,
        });

        // إضافة العروض إلى قائمة العروض العامة للموزع
        promotions.push(...productPromotions);
      }

      const coverage = `${Math.round((availableCount / dto.items.length) * 100)}%`;
      const canFulfill = availableCount === dto.items.length;
      const status = canFulfill ? 'full' : 'partial';

      results.push({
        distributorId: distributor.id,
        companyName: distributor.companyName,
        coverage,
        availableItems,
        promotions: this.removeDuplicatePromotions(promotions),
        canFulfill,
        status,
        ...(missingProducts.length > 0 && { missingProducts }),
      });
    }

    return { results };
  }

  private removeDuplicatePromotions(promotions: PromotionDto[]): PromotionDto[] {
    const seen = new Set<string>();
    return promotions.filter(promo => {
      const key = promo.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private async getProductPromotions(productId: string, distributorId: string, now: Date): Promise<PromotionDto[]> {
    const promotions: PromotionDto[] = [];

    // العروض من نوع percentage
    const percentagePromotions = await this.prisma.promotionProduct.findMany({
      where: {
        productId,
        promotion: {
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
          level: PromotionLevel.pharmacist,
          OR: [
            { distributorId: null },
            { distributorId },
          ],
        },
      },
      include: {
        promotion: {
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
          },
        },
      },
    });

    for (const promo of percentagePromotions) {

      // console.log('🚀 ~ orders.service.ts ~ OrdersService ~ getProductPromotions ~ promo:', promo);

      promotions.push({
        id: promo.id,
        type: 'percentage' as const,
        title: promo.promotion.title,
        description: promo.promotion.description,
        discountPercent: Number(promo.discountPercent),
      });
    }

    // العروض من نوع buyXgetY
    const buyXgetYPromotions = await this.prisma.promotionBuyXGetY.findMany({
      where: {
        OR: [
          { buyProductId: productId },
          // { freeProductId: productId },
        ],
        promotion: {
          isActive: true,
          startsAt: { lte: now },
          endsAt: { gte: now },
          level: PromotionLevel.pharmacist,
          type: PromotionType.buyXgetY,
          OR: [
            { distributorId: null },
            { distributorId },
          ],
        },
      },
      include: {
        promotion: {
          select: {
            id: true,
            title: true,
            description: true,
            type: true,
          },
        },
      },
    });
    
    for (const promo of buyXgetYPromotions) {
      // console.log('🚀 ~ orders.service.ts ~ OrdersService ~ getProductPromotions ~ promo:', promo);


      promotions.push({
        id: promo.id,
        promotionId: promo.promotionId,
        type: 'buyXgetY' as const,
        title: promo.promotion.title,
        description: promo.promotion.description,
        buyXgetYDetails: {
          buyProductId: promo.buyProductId,
          buyQuantity: promo.buyQuantity,
          freeProductId: promo.freeProductId,
          freeQuantity: promo.freeQuantity,
        },
      });
    }

    return promotions;
  }

  async findAvailableDistributors(userId: string, dto: FindDistributorsDto) {
    const pharmacist = await this.prisma.pharmacistProfile.findUnique({
      where: { userId },
      select: { id: true, areaId: true },
    });
    if (!pharmacist) throw new NotFoundException('Pharmacist profile not found');
    if (!pharmacist.areaId) throw new BadRequestException('Pharmacist area is not set');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cityId: true },
    });
    if (!user?.cityId) throw new BadRequestException('User city is not set');

    const todayIndex = new Date().getDay();
    const dayOrder: Record<WeekDay, number> = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6,
    };
    const dayNames: Record<WeekDay, string> = {
      sunday: 'الأحد', monday: 'الإثنين', tuesday: 'الثلاثاء',
      wednesday: 'الأربعاء', thursday: 'الخميس', friday: 'الجمعة',
      saturday: 'السبت',
    };

    const companyIdList = dto.companyIds?.split(',').map(id => id.trim()).filter(Boolean);

    const coverages = await this.prisma.distributorCoverageArea.findMany({
      where: { areaId: pharmacist.areaId },
      include: {
        distributor: {
          include: {
            user: {
              select: {
                id: true,
                fullName: true,
                email: true,
                phone: true,
                avatarUrl: true,
                city: { select: { id: true, nameAr: true, nameEn: true } },
              },
            },
            companyDistributors: {
              where: companyIdList?.length
                ? { companyId: { in: companyIdList }, status: 'active' }
                : { status: 'active' },
              include: {
                company: { select: { id: true, companyName: true } },
              },
            },
          },
        },
      },
    });

    const distributorMap = new Map<string, {
      id: string;
      companyName: string;
      licenseDocUrl: string | null;
      verifiedAt: Date | null;
      user: {
        id: string;
        fullName: string | null;
        email: string;
        phone: string | null;
        avatarUrl: string | null;
        city: { id: string; nameAr: string; nameEn: string | null } | null;
      };
      deliveryDays: { day: WeekDay; dayName: string; offset: number }[];
      nearestOffset: number;
      companies: { id: string; companyName: string }[];
    }>();

    for (const cov of coverages) {
      const dist = cov.distributor;
      if (!distributorMap.has(dist.id)) {
        distributorMap.set(dist.id, {
          id: dist.id,
          companyName: dist.companyName,
          licenseDocUrl: dist.licenseDocUrl,
          verifiedAt: dist.verifiedAt,
          user: dist.user,
          deliveryDays: [],
          nearestOffset: Infinity,
          companies: dist.companyDistributors.map(cd => cd.company),
        });
      }

      const entry = distributorMap.get(dist.id)!;
      const dayIndex = dayOrder[cov.dayOfWeek];
      const offset = (dayIndex - todayIndex + 7) % 7;
      entry.deliveryDays.push({
        day: cov.dayOfWeek,
        dayName: dayNames[cov.dayOfWeek],
        offset,
      });
      if (offset < entry.nearestOffset) entry.nearestOffset = offset;
    }

    const result = Array.from(distributorMap.values());
    result.sort((a, b) => a.nearestOffset - b.nearestOffset);

    // ترتيب أيام التوصيل لكل موزع حسب الأقرب
    for (const dist of result) {
      dist.deliveryDays.sort((a, b) => a.offset - b.offset);
    }

    return result;
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
        [OrderStatus.approved]: [OrderStatus.in_delivery],
        [OrderStatus.in_delivery]: [OrderStatus.delivered],
      },
      [UserRole.pharmacist]: {
        [OrderStatus.pending]: [OrderStatus.cancelled],
      },
      [UserRole.admin]: {
        [OrderStatus.pending]: [OrderStatus.approved,OrderStatus.rejected,OrderStatus.cancelled,],
        [OrderStatus.approved]: [OrderStatus.in_delivery,OrderStatus.cancelled,],
        [OrderStatus.in_delivery]: [OrderStatus.delivered],
      },
      [UserRole.delivery_staff]: {
        [OrderStatus.approved]: [OrderStatus.in_delivery],
        [OrderStatus.in_delivery]: [OrderStatus.delivered],
      },
      [UserRole.company]: {},
      [UserRole.doctor]: {},
      [UserRole.representative]: {},
    };

    const allowedNext = allowed[role]?.[current] ?? [];
    if (!allowedNext.includes(next)) {
      throw new BadRequestException(
        `Cannot transition from ${current} to ${next}`,
      );
    }
  }
}
