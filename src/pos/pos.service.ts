import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryMovementType, InventoryOwnerType, InventoryReferenceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateCashWithdrawalDto, CreateDisposalDto, CreateReturnDto } from './dto/pos-operations.dto';

@Injectable()
export class PosService {
  constructor(
    private prisma: PrismaService,
    private inventoryService: InventoryService,
  ) {}

  private async resolvePharmacist(userId: string) {
    const profile = await this.prisma.pharmacistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Pharmacist profile not found');
    return profile;
  }

  private get pharmacistOwner() {
    return (pharmacistId: string) => ({
      ownerType: InventoryOwnerType.pharmacist,
      ownerId: pharmacistId,
    });
  }

  async searchProducts(userId: string, query: string) {
    const pharmacist = await this.resolvePharmacist(userId);

    const isBarcode = /^[0-9]+$/.test(query.trim()) && query.trim().length >= 6;

    if (isBarcode) {
      const product = await this.prisma.product.findUnique({
        where: { barcode: query.trim() },
        select: {
          id: true, nameAr: true, nameEn: true, barcode: true,
          dosageForm: true, strength: true, packSize: true, packUnit: true,
          pharmacistToConsumerPrice: true, imageUrl: true,
          inventories: {
            where: { pharmacistId: pharmacist.id },
            select: { quantityAvailable: true },
          },
        },
      });
      if (!product) throw new NotFoundException('Product not found');
      const { inventories, ...rest } = product;
      return [{ ...rest, quantityAvailable: inventories[0]?.quantityAvailable ?? 0 }];
    }

    const products = await this.prisma.product.findMany({
      where: {
        OR: [
          { nameAr: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
        ],
        inventories: { some: { pharmacistId: pharmacist.id, quantityAvailable: { gt: 0 } } },
      },
      take: 10,
      select: {
        id: true, nameAr: true, nameEn: true, barcode: true,
        dosageForm: true, strength: true, packSize: true, packUnit: true,
        pharmacistToConsumerPrice: true, imageUrl: true,
        inventories: {
          where: { pharmacistId: pharmacist.id },
          select: { quantityAvailable: true },
        },
      },
    });

    return products.map(({ inventories, ...rest }) => ({
      ...rest,
      quantityAvailable: inventories[0]?.quantityAvailable ?? 0,
    }));
  }

  async createSale(userId: string, dto: CreateSaleDto) {
    const pharmacist = await this.resolvePharmacist(userId);
    const owner = this.pharmacistOwner(pharmacist.id);

    return this.prisma.$transaction(async (tx) => {
      const saleItems: { productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number }[] = [];
      let totalAmount = 0;

      for (const item of dto.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          select: { id: true, nameAr: true, pharmacistToConsumerPrice: true },
        });
        if (!product) throw new NotFoundException(`Product ${item.productId} not found`);

        const unitPrice = Number(product.pharmacistToConsumerPrice);
        const subtotal = unitPrice * item.quantity;
        totalAmount += subtotal;

        await this.inventoryService.decreaseStock(
          owner, item.productId, item.quantity, userId,
          InventoryReferenceType.pos_sale, undefined, tx,
        );

        saleItems.push({
          productId: item.productId,
          productName: product.nameAr,
          quantity: item.quantity,
          unitPrice,
          subtotal,
        });
      }

      const count = await tx.posSale.count({ where: { pharmacistId: pharmacist.id } });
      const saleNumber = `POS-${Date.now()}-${count + 1}`;

      return tx.posSale.create({
        data: {
          pharmacistId: pharmacist.id,
          saleNumber,
          paymentMethod: dto.paymentMethod,
          totalAmount,
          items: { create: saleItems },
        },
        include: { items: true },
      });
    });
  }

  async createReturn(userId: string, dto: CreateReturnDto) {
    const pharmacist = await this.resolvePharmacist(userId);
    const owner = this.pharmacistOwner(pharmacist.id);

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { id: true, nameAr: true, pharmacistToConsumerPrice: true },
      });
      if (!product) throw new NotFoundException('Product not found');

      // حساب المبلغ المسترد (سعر المنتج × الكمية)
      const unitPrice = Number(product.pharmacistToConsumerPrice);
      const refundAmount = unitPrice * dto.quantity;

      // إرجاع المنتج إلى المخزون
      await this.inventoryService.increaseStock(
        owner, dto.productId, dto.quantity, userId,
        InventoryReferenceType.pos_return, undefined,
        dto.note, tx,
      );

      // خصم المبلغ من درج الصيدلي (تسجيل سحب نقدي)
      await tx.posCashWithdrawal.create({
        data: {
          pharmacistId: pharmacist.id,
          amount: refundAmount,
          reason: `إرجاع منتج: ${product.nameAr} - ${dto.note || 'بدون ملاحظة'}`,
        },
      });

      return tx.posReturn.create({
        data: {
          pharmacistId: pharmacist.id,
          productId: dto.productId,
          quantity: dto.quantity,
          note: dto.note,
          refundAmount,
        },
      });
    });
  }

  async createDisposal(userId: string, dto: CreateDisposalDto) {
    const pharmacist = await this.resolvePharmacist(userId);
    const owner = this.pharmacistOwner(pharmacist.id);

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({
        where: { id: dto.productId },
        select: { id: true },
      });
      if (!product) throw new NotFoundException('Product not found');

      await this.inventoryService.decreaseStock(
        owner, dto.productId, dto.quantity, userId,
        InventoryReferenceType.pos_disposal, undefined, tx,
      );

      return tx.posDisposal.create({
        data: {
          pharmacistId: pharmacist.id,
          productId: dto.productId,
          quantity: dto.quantity,
          note: dto.note,
        },
      });
    });
  }

  async createCashWithdrawal(userId: string, dto: CreateCashWithdrawalDto) {
    const pharmacist = await this.resolvePharmacist(userId);

    return this.prisma.posCashWithdrawal.create({
      data: {
        pharmacistId: pharmacist.id,
        amount: dto.amount,
        reason: dto.reason,
      },
    });
  }

  async getDailySummary(userId: string, date?: string) {
    const pharmacist = await this.resolvePharmacist(userId);

    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate);
    end.setHours(23, 59, 59, 999);

    const allTimeStart = new Date('2000-01-01');

    const [
      todaySales,
      todayCashSales,
      todayWithdrawals,
      allCashSales,
      allDistributorPayments,
      allWithdrawals,
    ] = await Promise.all([
      // مجموع مبيعات اليوم (كل طرق الدفع)
      this.prisma.posSale.aggregate({
        where: { pharmacistId: pharmacist.id, createdAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // مبيعات كاش اليوم فقط
      this.prisma.posSale.aggregate({
        where: { pharmacistId: pharmacist.id, paymentMethod: 'cash', createdAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      }),
      // سحوبات اليوم
      this.prisma.posCashWithdrawal.aggregate({
        where: { pharmacistId: pharmacist.id, createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      // كل مبيعات الكاش (لحساب الدرج التراكمي)
      this.prisma.posSale.aggregate({
        where: { pharmacistId: pharmacist.id, paymentMethod: 'cash', createdAt: { gte: allTimeStart } },
        _sum: { totalAmount: true },
      }),
      // كل مدفوعات الموزعين نقداً (cod)
      this.prisma.order.aggregate({
        where: {
          pharmacistId: pharmacist.id,
          paymentMethod: 'cod',
          status: 'delivered',
          createdAt: { gte: allTimeStart },
        },
        _sum: { totalAmount: true },
      }),
      // كل السحوبات
      this.prisma.posCashWithdrawal.aggregate({
        where: { pharmacistId: pharmacist.id, createdAt: { gte: allTimeStart } },
        _sum: { amount: true },
      }),
    ]);

    const totalCashSalesAllTime = Number(allCashSales._sum.totalAmount ?? 0);
    const totalDistributorPaymentsAllTime = Number(allDistributorPayments._sum.totalAmount ?? 0);
    const totalWithdrawalsAllTime = Number(allWithdrawals._sum.amount ?? 0);

    const drawerAmount = totalCashSalesAllTime - totalDistributorPaymentsAllTime - totalWithdrawalsAllTime;

    return {
      date: targetDate.toISOString().split('T')[0],
      today: {
        totalSales: Number(todaySales._sum.totalAmount ?? 0),
        salesCount: todaySales._count,
        cashSales: Number(todayCashSales._sum.totalAmount ?? 0),
        withdrawals: Number(todayWithdrawals._sum.amount ?? 0),
      },
      drawer: {
        cashSalesAllTime: totalCashSalesAllTime,
        distributorPaymentsAllTime: totalDistributorPaymentsAllTime,
        withdrawalsAllTime: totalWithdrawalsAllTime,
        currentAmount: drawerAmount,
      },
    };
  }

  async getSales(userId: string, startDate?: string, endDate?: string) {
    const pharmacist = await this.resolvePharmacist(userId);

    const where: any = { pharmacistId: pharmacist.id };
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    return this.prisma.posSale.findMany({
      where,
      include: {
        items: {
          include: { product: { select: { nameAr: true, nameEn: true, imageUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getWithdrawals(userId: string, startDate?: string, endDate?: string) {
    const pharmacist = await this.resolvePharmacist(userId);

    const where: any = { pharmacistId: pharmacist.id };
    
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        where.createdAt.gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    return this.prisma.posCashWithdrawal.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }
}
