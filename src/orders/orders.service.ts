import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus, UserRole } from '@prisma/client';
import { DistributorInventoryService } from '../distributor-inventory/distributor-inventory.service';

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: DistributorInventoryService,
  ) {}

  private async getPharmacistProfile(userId: string) {
    const profile = await this.prisma.pharmacistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Pharmacist profile not found');
    return profile;
  }

  private async getDistributorProfile(userId: string) {
    const profile = await this.prisma.distributorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Distributor profile not found');
    return profile;
  }

  private generateOrderNumber(): string {
    const year = new Date().getFullYear();
    const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
    return `ORD-${year}-${random}`;
  }

  // تجميع الـ items حسب الشركة
  private async groupItemsByCompany(items: CreateOrderDto['items']) {
    const groups = new Map<string, typeof items>();

    for (const item of items) {
      const product = await this.prisma.product.findUnique({
        where: { id: item.productId },
        select: { id: true, companyId: true, price: true, nameAr: true, status: true },
      });
      if (!product) throw new NotFoundException(`Product ${item.productId} not found`);
      if (product.status !== 'active') throw new BadRequestException(`Product ${product.nameAr} is not active`);

      const existing = groups.get(product.companyId) ?? [];
      existing.push({ ...item, _product: product } as any);
      groups.set(product.companyId, existing);
    }

    return groups;
  }

  // إيجاد الموزع المناسب
  private async findDistributor(companyId: string, cityId: string): Promise<string | null> {
    const cd = await this.prisma.companyDistributor.findFirst({
      where: { companyId, cityId, status: 'active' },
      select: { distributorId: true },
    });
    return cd?.distributorId ?? null;
  }

  async create(userId: string, dto: CreateOrderDto) {
    const pharmacist = await this.getPharmacistProfile(userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { cityId: true },
    });
    if (!user?.cityId) throw new BadRequestException('User city is not set');

    const groups = await this.groupItemsByCompany(dto.items);
    const createdOrders: any[] = [];

    for (const [companyId, items] of groups) {
      const distributorId = await this.findDistributor(companyId, user.cityId);

      // حساب الـ items مع الخصومات
      const orderItemsData = await Promise.all(
        items.map(async (item: any) => {
          const unitPrice = Number(item._product.price);
          let discountAmount = 0;

          if (item.promotionProductId) {
            const promo = await this.prisma.promotionProduct.findUnique({
              where: { id: item.promotionProductId },
              select: { discountPercent: true, productId: true, promotion: { select: { isActive: true, startsAt: true, endsAt: true } } },
            });
            if (promo && promo.productId === item.productId && promo.promotion.isActive) {
              const now = new Date();
              if (now >= promo.promotion.startsAt && now <= promo.promotion.endsAt) {
                discountAmount = (unitPrice * item.quantity * Number(promo.discountPercent)) / 100;
              }
            }
          }

          return {
            productId: item.productId,
            productName: item._product.nameAr,
            quantity: item.quantity,
            unitPrice,
            promotionProductId: item.promotionProductId ?? null,
            discountAmount,
            subtotal: unitPrice * item.quantity - discountAmount,
          };
        }),
      );

      const totalAmount = orderItemsData.reduce((sum, i) => sum + i.subtotal, 0);

      const order = await this.prisma.order.create({
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
        include: { orderItems: true, distributor: { select: { companyName: true } } },
      });

      createdOrders.push(order);
    }

    return createdOrders.length === 1 ? createdOrders[0] : createdOrders;
  }

  async findAll(userId: string, role: UserRole) {
    const where: any = {};

    if (role === UserRole.pharmacist) {
      const profile = await this.getPharmacistProfile(userId);
      where.pharmacistId = profile.id;
    } else if (role === UserRole.distributor) {
      const profile = await this.getDistributorProfile(userId);
      where.distributorId = profile.id;
    }
    // admin يشوف الكل

    return this.prisma.order.findMany({
      where,
      include: { orderItems: true, city: { select: { nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: UserRole) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        orderItems: { include: { product: { select: { nameAr: true, imageUrl: true } } } },
        pharmacist: { select: { pharmacyName: true } },
        distributor: { select: { companyName: true } },
        city: { select: { nameAr: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    // التحقق من الصلاحية
    if (role === UserRole.pharmacist) {
      const profile = await this.getPharmacistProfile(userId);
      if (order.pharmacistId !== profile.id) throw new ForbiddenException();
    } else if (role === UserRole.distributor) {
      const profile = await this.getDistributorProfile(userId);
      if (order.distributorId !== profile.id) throw new ForbiddenException();
    }

    return order;
  }

  async updateStatus(id: string, userId: string, role: UserRole, dto: UpdateOrderStatusDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');

    this.validateStatusTransition(order.status, dto.status, role, userId);

    if (role === UserRole.distributor) {
      const profile = await this.getDistributorProfile(userId);
      if (order.distributorId !== profile.id) throw new ForbiddenException();
    }

    if (role === UserRole.pharmacist) {
      const profile = await this.getPharmacistProfile(userId);
      if (order.pharmacistId !== profile.id) throw new ForbiddenException();
    }

    if (dto.status === OrderStatus.rejected && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: dto.status,
          ...(dto.rejectionReason && { rejectionReason: dto.rejectionReason }),
          ...(dto.status === OrderStatus.approved && { approvedAt: new Date() }),
          ...(dto.status === OrderStatus.delivered && { deliveredAt: new Date() }),
        },
        include: { orderItems: true },
      });

      // خصم من المخزون لما يتسلم الطلب
      if (dto.status === OrderStatus.delivered && order.distributorId) {
        await this.inventoryService.deductForOrder(
          order.distributorId,
          id,
          updated.orderItems.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          userId,
          tx,
        );
      }

      return updated;
    });
  }

  private validateStatusTransition(current: OrderStatus, next: OrderStatus, role: UserRole, _userId: string) {
    const allowed: Record<UserRole, Partial<Record<OrderStatus, OrderStatus[]>>> = {
      [UserRole.distributor]: {
        [OrderStatus.pending]: [OrderStatus.approved, OrderStatus.rejected],
        [OrderStatus.approved]: [OrderStatus.in_delivery],
        [OrderStatus.in_delivery]: [OrderStatus.delivered],
      },
      [UserRole.pharmacist]: {
        [OrderStatus.pending]: [OrderStatus.cancelled],
      },
      [UserRole.admin]: {
        [OrderStatus.pending]: [OrderStatus.approved, OrderStatus.rejected, OrderStatus.cancelled],
        [OrderStatus.approved]: [OrderStatus.in_delivery, OrderStatus.cancelled],
        [OrderStatus.in_delivery]: [OrderStatus.delivered],
      },
      [UserRole.company]: {},
      [UserRole.doctor]: {},
    };

    const allowedNext = allowed[role]?.[current] ?? [];
    if (!allowedNext.includes(next)) {
      throw new BadRequestException(`Cannot transition from ${current} to ${next}`);
    }
  }
}
