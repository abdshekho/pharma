import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryOwnerType, InventoryReferenceType } from '@prisma/client';
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
        inventories: { some: { pharmacistId: pharmacist.id } },
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
  async searchProductsOrder(userId: string, query: string) {
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
        // inventories: { some: { pharmacistId: pharmacist.id, quantityAvailable: { gt: 0 } } },
      },
      take: 5,
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

      // const count = await tx.posSale.count({ where: { pharmacistId: pharmacist.id } });
      const saleNumber = `POS-${Date.now()}`;

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

    // تنفيذ الاستعلامات في مجموعات لتجنب مشكلة اتصالات قاعدة البيانات
    const [
      todayData,
      cumulativeData,
    ] = await Promise.all([
      // بيانات اليوم
      this.getTodayData(pharmacist.id, start, end),
      // البيانات التراكمية حتى التاريخ المحدد
      this.getCumulativeData(pharmacist.id, end),
    ]);

    const {
      totalSales,
      salesCount,
      cashSales,
      withdrawals,
      withdrawalsCount,
      distributorPayments,
      distributorPaymentsCount,
      returns,
      returnsCount,
    } = todayData;

    const {
      cashSalesUntilDate,
      distributorPaymentsUntilDate,
      withdrawalsUntilDate,
      returnsUntilDate,
    } = cumulativeData;

    const drawerAmount = cashSalesUntilDate - distributorPaymentsUntilDate - withdrawalsUntilDate - returnsUntilDate;

    return {
      date: targetDate.toISOString().split('T')[0],
      today: {
        totalSales,
        salesCount,
        cashSales,
        withdrawals,
        withdrawalsCount,
        distributorPayments,
        distributorPaymentsCount,
        returns,
        returnsCount,
      },
      drawer: {
        cashSalesUntilDate,
        distributorPaymentsUntilDate,
        withdrawalsUntilDate,
        returnsUntilDate,
        currentAmount: drawerAmount,
      },
    };
  }

  private async getTodayData(pharmacistId: string, start: Date, end: Date) {
    const [
      todaySales,
      todayCashSales,
      todayWithdrawals,
      todayDistributorPayments,
      todayReturns,
    ] = await Promise.all([
      // مجموع مبيعات اليوم (كل طرق الدفع)
      this.prisma.posSale.aggregate({
        where: { pharmacistId: pharmacistId, createdAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // مبيعات كاش اليوم فقط
      this.prisma.posSale.aggregate({
        where: { pharmacistId: pharmacistId, paymentMethod: 'cash', createdAt: { gte: start, lte: end } },
        _sum: { totalAmount: true },
      }),
      // سحوبات اليوم
      this.prisma.posCashWithdrawal.aggregate({
        where: { pharmacistId: pharmacistId, createdAt: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: true,
      }),
      // مدفوعات الموزعين نقداً (cod) في اليوم المحدد
      this.prisma.order.aggregate({
        where: {
          pharmacistId: pharmacistId,
          paymentMethod: 'cod',
          status: 'delivered',
          createdAt: { gte: start, lte: end },
        },
        _sum: { totalAmount: true },
        _count: true,
      }),
      // المرتجعات في اليوم المحدد
      this.prisma.posReturn.aggregate({
        where: { pharmacistId: pharmacistId, createdAt: { gte: start, lte: end } },
        _sum: { refundAmount: true },
        _count: true,
      }),
    ]);

    return {
      totalSales: Number(todaySales._sum.totalAmount ?? 0),
      salesCount: todaySales._count,
      cashSales: Number(todayCashSales._sum.totalAmount ?? 0),
      withdrawals: Number(todayWithdrawals._sum.amount ?? 0),
      withdrawalsCount: todayWithdrawals._count,
      distributorPayments: Number(todayDistributorPayments._sum.totalAmount ?? 0),
      distributorPaymentsCount: todayDistributorPayments._count,
      returns: Number(todayReturns._sum.refundAmount ?? 0),
      returnsCount: todayReturns._count,
    };
  }

  private async getCumulativeData(pharmacistId: string, end: Date) {
    const [
      cashSalesUntilDate,
      distributorPaymentsUntilDate,
      withdrawalsUntilDate,
      returnsUntilDate,
    ] = await Promise.all([
      // مبيعات الكاش حتى التاريخ المحدد
      this.prisma.posSale.aggregate({
        where: { pharmacistId: pharmacistId, paymentMethod: 'cash', createdAt: { lte: end } },
        _sum: { totalAmount: true },
      }),
      // مدفوعات الموزعين نقداً (cod) حتى التاريخ المحدد
      this.prisma.order.aggregate({
        where: {
          pharmacistId: pharmacistId,
          paymentMethod: 'cod',
          status: 'delivered',
          createdAt: { lte: end },
        },
        _sum: { totalAmount: true },
      }),
      // السحوبات حتى التاريخ المحدد
      this.prisma.posCashWithdrawal.aggregate({
        where: { pharmacistId: pharmacistId, createdAt: { lte: end } },
        _sum: { amount: true },
      }),
      // المرتجعات حتى التاريخ المحدد
      this.prisma.posReturn.aggregate({
        where: { pharmacistId: pharmacistId, createdAt: { lte: end } },
        _sum: { refundAmount: true },
      }),
    ]);

    return {
      cashSalesUntilDate: Number(cashSalesUntilDate._sum.totalAmount ?? 0),
      distributorPaymentsUntilDate: Number(distributorPaymentsUntilDate._sum.totalAmount ?? 0),
      withdrawalsUntilDate: Number(withdrawalsUntilDate._sum.amount ?? 0),
      returnsUntilDate: Number(returnsUntilDate._sum.refundAmount ?? 0),
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

  async getAlternatives(userId: string, productId: string, withDosageForm: boolean = false) {
    const pharmacist = await this.resolvePharmacist(userId);

    // الحصول على معلومات المنتج الأصلي (لجلب dosageForm إذا لزم الأمر)
    const originalProduct = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { dosageForm: true },
    });

    if (!originalProduct) {
      throw new NotFoundException('Product not found');
    }

    // الحصول على drug_groups الخاصة بالمنتج المطلوب
    const productDrugGroups = await this.prisma.productDrugGroup.findMany({
      where: { productId },
      select: { drugGroupId: true },
    });

    if (productDrugGroups.length === 0) {
      return [];
    }

    const drugGroupIds = productDrugGroups.map(pdg => pdg.drugGroupId);

    // بناء شرط where ديناميكي
    const whereConditions: any = {
      AND: [
        { id: { not: productId } }, // استبعاد المنتج الأصلي
        { status: 'active' }, // فقط المنتجات النشطة
        {
          productDrugGroups: {
            some: {
              drugGroupId: { in: drugGroupIds },
            },
          },
        },
      ],
    };

    // إضافة شرط dosageForm إذا كان المطلوب
    if (withDosageForm && originalProduct.dosageForm) {
      whereConditions.AND.push({ dosageForm: originalProduct.dosageForm });
    }

    // البحث عن المنتجات الأخرى التي تشترك في نفس drug_groups
    const alternativeProducts = await this.prisma.product.findMany({
      where: whereConditions,
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        barcode: true,
        dosageForm: true,
        strength: true,
        packSize: true,
        packUnit: true,
        pharmacistToConsumerPrice: true,
        imageUrl: true,
        inventories: {
          where: { pharmacistId: pharmacist.id },
          select: { quantityAvailable: true },
        },
      },
      orderBy: { nameAr: 'asc' },
    });

    // تنسيق النتائج مع إضافة quantityAvailable
    return alternativeProducts.map(product => ({
      ...product,
      quantityAvailable: product.inventories[0]?.quantityAvailable ?? 0,
      inventories: undefined, // إزالة الحقل الأصلي
    }));
  }
}
