import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddStockDto } from './dto/add-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { InventoryMovementType } from '@prisma/client';

@Injectable()
export class DistributorInventoryService {
  constructor(private prisma: PrismaService) {}

  private async resolveDistributorId(userId: string) {
    const p = await this.prisma.distributorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!p) throw new NotFoundException('Distributor profile not found');
    return p.id;
  }

  // الموزع يسجل استلام بضاعة من شركة
  async addStock(userId: string, dto: AddStockDto) {
    const distributorId = await this.resolveDistributorId(userId);

    // تحقق إن الموزع مرتبط بهاي الشركة
    const linked = await this.prisma.companyDistributor.findFirst({
      where: { distributorId, companyId: dto.companyId, status: 'active' },
    });
    if (!linked) throw new BadRequestException('Not linked to this company');

    // تحقق إن المنتج تابع لهاي الشركة
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, companyId: dto.companyId },
      select: { id: true, nameAr: true },
    });
    if (!product) throw new NotFoundException('Product not found for this company');

    // upsert المخزون + تسجيل الحركة في transaction
    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.distributorInventory.upsert({
        where: { distributorId_productId: { distributorId, productId: dto.productId } },
        create: {
          distributorId,
          productId: dto.productId,
          quantityAvailable: dto.quantity,
          lowStockThreshold: dto.lowStockThreshold ?? 10,
        },
        update: {
          quantityAvailable: { increment: dto.quantity },
          ...(dto.lowStockThreshold !== undefined && { lowStockThreshold: dto.lowStockThreshold }),
          lastUpdated: new Date(),
        },
      });

      await tx.inventoryMovement.create({
        data: {
          distributorId,
          productId: dto.productId,
          type: InventoryMovementType.in,
          quantity: dto.quantity,
          referenceId: dto.companyId, // نحفظ الشركة كـ reference
          createdBy: userId,
        },
      });

      return inventory;
    });
  }

  // تصحيح يدوي للمخزون
  async adjustStock(userId: string, dto: AdjustStockDto) {
    const distributorId = await this.resolveDistributorId(userId);

    const inventory = await this.prisma.distributorInventory.findUnique({
      where: { distributorId_productId: { distributorId, productId: dto.productId } },
    });
    if (!inventory) throw new NotFoundException('Inventory record not found');

    const newQty = inventory.quantityAvailable + dto.quantity;
    if (newQty < 0) throw new BadRequestException('Adjustment would result in negative stock');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.distributorInventory.update({
        where: { distributorId_productId: { distributorId, productId: dto.productId } },
        data: { quantityAvailable: newQty, lastUpdated: new Date() },
      });

      await tx.inventoryMovement.create({
        data: {
          distributorId,
          productId: dto.productId,
          type: InventoryMovementType.adjustment,
          quantity: dto.quantity,
          createdBy: userId,
        },
      });

      return updated;
    });
  }

  // عرض مخزون الموزع
  async findAll(userId: string) {
    const distributorId = await this.resolveDistributorId(userId);

    return this.prisma.distributorInventory.findMany({
      where: { distributorId },
      include: { product: { select: { nameAr: true, nameEn: true, imageUrl: true } } },
      orderBy: { lastUpdated: 'desc' },
    });
  }

  // عرض حركات المخزون
  async findMovements(userId: string, productId?: string) {
    const distributorId = await this.resolveDistributorId(userId);

    return this.prisma.inventoryMovement.findMany({
      where: {
        distributorId,
        ...(productId && { productId }),
      },
      include: { product: { select: { nameAr: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  // خصم من المخزون لما يتسلم طلب — يُستدعى من OrdersService
  async deductForOrder(
    distributorId: string,
    orderId: string,
    items: { productId: string; quantity: number }[],
    createdBy: string,
    tx: any,
  ) {
    for (const item of items) {
      const inventory = await tx.distributorInventory.findUnique({
        where: { distributorId_productId: { distributorId, productId: item.productId } },
      });

      // لو ما في مخزون مسجل نتجاوز بدون error (الموزع ممكن ما يكون سجل)
      if (!inventory) continue;

      const newQty = Math.max(0, inventory.quantityAvailable - item.quantity);

      await tx.distributorInventory.update({
        where: { distributorId_productId: { distributorId, productId: item.productId } },
        data: { quantityAvailable: newQty, lastUpdated: new Date() },
      });

      await tx.inventoryMovement.create({
        data: {
          distributorId,
          productId: item.productId,
          type: InventoryMovementType.out,
          quantity: item.quantity,
          referenceId: orderId,
          createdBy,
        },
      });
    }
  }
}
