import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { PromotionType, PromotionTargetType, UserRole, NotificationRelatedType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PromotionsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private async notifyForTargetType(targetType: PromotionTargetType, title: string, relatedId: string) {
    if (targetType === PromotionTargetType.doctors || targetType === PromotionTargetType.all) {
      await this.notifications.createForRole(UserRole.doctor, {
        type: 'promotion',
        title,
        relatedId,
        relatedType: NotificationRelatedType.promotion,
      });
    }
    if (targetType === PromotionTargetType.pharmacists || targetType === PromotionTargetType.all) {
      await this.notifications.createForRole(UserRole.pharmacist, {
        type: 'promotion',
        title,
        relatedId,
        relatedType: NotificationRelatedType.promotion,
      });
    }
  }

  private async resolveCompanyId(userId: string) {
    const p = await this.prisma.companyProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Company profile not found');
    return p.id;
  }

  private async resolveDistributorId(userId: string) {
    const p = await this.prisma.distributorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Distributor profile not found');
    return p.id;
  }

  async create(userId: string, role: UserRole, dto: CreatePromotionDto) {
    if (role === UserRole.distributor && !dto.parentPromotionId) {
      // عرض مستقل من الموزع — لازم يحدد companyId بطريقة ثانية
      // هون نتحقق إنو الموزع مرتبط بشركة
    }

    // لو موزع ونسخ عرض الشركة — نتحقق إنو العرض الأصلي موجود
    if (dto.parentPromotionId) {
      const parent = await this.prisma.promotion.findUnique({ where: { id: dto.parentPromotionId } });
      if (!parent) throw new NotFoundException('Parent promotion not found');
    }

    if (dto.type === PromotionType.percentage && (!dto.products || dto.products.length === 0)) {
      throw new BadRequestException('Products with discount are required for percentage promotions');
    }
    if (dto.type === PromotionType.buyXgetY && !dto.buyXgetY) {
      throw new BadRequestException('buyXgetY details are required');
    }

    // نحدد companyId
    let companyId: string;
    let distributorId: string | null = null;

    if (role === UserRole.company) {
      companyId = await this.resolveCompanyId(userId);
    } else if (role === UserRole.distributor) {
      distributorId = await this.resolveDistributorId(userId);
      // نجيب companyId من العرض الأصلي أو من أول شركة مرتبط فيها
      if (dto.parentPromotionId) {
        const parent = await this.prisma.promotion.findUnique({ where: { id: dto.parentPromotionId }, select: { companyId: true } });
        companyId = parent!.companyId;
      } else {
        const cd = await this.prisma.companyDistributor.findFirst({ where: { distributorId, status: 'active' }, select: { companyId: true } });
        if (!cd) throw new BadRequestException('Distributor is not linked to any company');
        companyId = cd.companyId;
      }
    } else {
      throw new ForbiddenException();
    }

    const created = await this.prisma.promotion.create({
      data: {
        title: dto.title,
        description: dto.description,
        type: dto.type,
        level: dto.level,
        targetType: dto.targetType,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        imageUrl: dto.imageUrl,
        isActive: dto.isActive ?? false,
        companyId,
        distributorId,
        parentPromotionId: dto.parentPromotionId,
        ...(dto.type === PromotionType.percentage && dto.products?.length && {
          promotionProducts: {
            create: dto.products.map((p) => ({ productId: p.productId, discountPercent: p.discountPercent })),
          },
        }),
        ...(dto.type === PromotionType.buyXgetY && dto.buyXgetY && {
          buyXgetY: {
            create: {
              buyProductId: dto.buyXgetY.buyProductId,
              buyQuantity: dto.buyXgetY.buyQuantity,
              freeProductId: dto.buyXgetY.freeProductId,
              freeQuantity: dto.buyXgetY.freeQuantity,
            },
          },
        }),
      },
      include: { promotionProducts: true, buyXgetY: true },
    });

    if (created.isActive) {
      await this.notifyForTargetType(created.targetType, `New offer: ${created.title}`, created.id);
    }

    return created;
  }

  async findAll(filters: {
    companyId?: string;
    distributorId?: string;
    distributorIds?: string;
    level?: string;
    type?: string;
    productId?: string;
    targetType?: string;
  }) {
    const productFilter = filters.productId
      ? {
          OR: [
            { promotionProducts: { some: { productId: filters.productId } } },
            { buyXgetY: { buyProductId: filters.productId } },
            { buyXgetY: { freeProductId: filters.productId } },
          ],
        }
      : {};

    const distributorIdList = filters.distributorIds
      ?.split(',')
      .map((id) => id.trim())
      .filter(Boolean);

    return this.prisma.promotion.findMany({
      where: {
        ...(filters.companyId && { companyId: filters.companyId }),
        ...(filters.distributorId && { distributorId: filters.distributorId }),
        ...(distributorIdList?.length && { distributorId: { in: distributorIdList } }),
        ...(filters.level && { level: filters.level as any }),
        ...(filters.type && { type: filters.type as any }),
        ...(filters.targetType && { targetType: filters.targetType as any }),
        ...productFilter,
      },
      include: {
        promotionProducts: {
          include: {
            product: {
              select: { id: true, nameAr: true, nameEn: true, imageUrl: true, distributorToPharmacistPrice: true },
            },
          },
        },
        buyXgetY: {
          include: {
            buyProduct: {
              select: { id: true, nameAr: true, nameEn: true, imageUrl: true, distributorToPharmacistPrice: true },
            },
            freeProduct: {
              select: { id: true, nameAr: true, nameEn: true, imageUrl: true, distributorToPharmacistPrice: true },
            },
          },
        },
        childPromotions: { select: { id: true, title: true, distributorId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const promo = await this.prisma.promotion.findUnique({
      where: { id },
      include: {
        promotionProducts: { include: { product: { select: { nameAr: true } } } },
        buyXgetY: {
          include: {
            buyProduct: { select: { nameAr: true } },
            freeProduct: { select: { nameAr: true } },
          },
        },
        parentPromotion: { select: { id: true, title: true } },
        childPromotions: { select: { id: true, title: true, distributorId: true } },
      },
    });
    if (!promo) throw new NotFoundException('Promotion not found');
    return promo;
  }

  async toggleActive(id: string, userId: string, role: UserRole) {
    const promo = await this.prisma.promotion.findUnique({ where: { id } });
    if (!promo) throw new NotFoundException('Promotion not found');

    if (role === UserRole.company) {
      const companyId = await this.resolveCompanyId(userId);
      if (promo.companyId !== companyId) throw new ForbiddenException();
    } else if (role === UserRole.distributor) {
      const distributorId = await this.resolveDistributorId(userId);
      if (promo.distributorId !== distributorId) throw new ForbiddenException();
    }

    const newIsActive = !promo.isActive;
    const updated = await this.prisma.promotion.update({ where: { id }, data: { isActive: newIsActive } });

    if (newIsActive) {
      await this.notifyForTargetType(updated.targetType, `New offer: ${updated.title}`, updated.id);
    }

    return updated;
  }
}
