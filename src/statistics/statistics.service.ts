import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrderStatus, InventoryOwnerType, Prisma } from "@prisma/client";

@Injectable()
export class StatisticsService {
  constructor(private prisma: PrismaService) {}

  private dateFilter(startDate?: string, endDate?: string) {
    const filter: any = {};
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) filter.createdAt.gte = new Date(startDate);
      if (endDate) filter.createdAt.lte = new Date(endDate);
    }
    return filter;
  }

  async getAdminStats(startDate?: string, endDate?: string) {
    const dateFilter = this.dateFilter(startDate, endDate);
    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const [
      usersByRole,
      newUsersLast30,
      totalPharmacistOrders,
      totalCompanyOrders,
      salesPharmacist,
      salesCompany,
      activeProducts,
      bestSellers,
    ] = await Promise.all([
      this.prisma.user.groupBy({
        by: ["role"],
        _count: { id: true },
        where: { ...dateFilter },
      }),
      this.prisma.user.count({
        where: { createdAt: { gte: last30Days } },
      }),
      this.prisma.order.count({ where: dateFilter }),
      this.prisma.companyDistributorOrder.count({ where: { ...dateFilter } }),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { status: OrderStatus.delivered, ...dateFilter },
      }),
      this.prisma.companyDistributorOrder.aggregate({
        _sum: { totalAmount: true },
        where: { status: OrderStatus.delivered, ...dateFilter },
      }),
      this.prisma.product.count({
        where: { status: "active" },
      }),
      this.prisma.orderItem.groupBy({
        by: ["productId"],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 10,
        where: {
          order: { status: OrderStatus.delivered, ...dateFilter },
        },
      }),
    ]);

    const bestSellerIds = bestSellers.map((b) => b.productId);
    const products =
      bestSellerIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: bestSellerIds } },
            select: { id: true, nameAr: true, nameEn: true },
          })
        : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    return {
      usersByRole: usersByRole.map((r) => ({
        role: r.role,
        count: r._count.id,
      })),
      newUsersLast30Days: newUsersLast30,
      totalOrders: totalPharmacistOrders + totalCompanyOrders,
      pharmacistOrders: totalPharmacistOrders,
      companyOrders: totalCompanyOrders,
      totalSalesValue: {
        pharmacistOrders:
          salesPharmacist._sum.totalAmount?.toNumber() ?? 0,
        companyOrders: salesCompany._sum.totalAmount?.toNumber() ?? 0,
        total:
          (salesPharmacist._sum.totalAmount?.toNumber() ?? 0) +
          (salesCompany._sum.totalAmount?.toNumber() ?? 0),
      },
      activeProducts,
      bestSellingProducts: bestSellers.map((b) => ({
        productId: b.productId,
        nameAr: productMap.get(b.productId)?.nameAr ?? "",
        nameEn: productMap.get(b.productId)?.nameEn ?? "",
        totalQuantity: b._sum.quantity ?? 0,
      })),
    };
  }

 async getCompanyStats(
  companyId: string,
  startDate?: string,
  endDate?: string,
) {
  // 1. التحقق من وجود الشركة
  const company = await this.prisma.companyProfile.findUnique({
    where: { id: companyId },
  });
  if (!company) throw new NotFoundException("Company not found");

  // 2. تجهيز فلتر التاريخ
  const dateFilter = this.dateFilter(startDate, endDate);
  const whereDate = { ...dateFilter };

  // 3. تنفيذ جميع الاستعلامات بشكل متوازي
  const [
    totalSales,
    bestSellersRaw,
    totalInventory,
    lowStockProducts,
    sampleRequestsCount,
    activeReps,
  ] = await Promise.all([
    // إجمالي المبيعات
    this.prisma.companyDistributorOrder.aggregate({
      _sum: { totalAmount: true },
      where: {
        companyId,
        status: OrderStatus.delivered,
        ...whereDate,
      },
    }),

    // أفضل منتج مبيعاً
    this.prisma.companyDistributorOrderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 1,
      where: {
        order: { companyId, status: OrderStatus.delivered, ...whereDate },
      },
    }),

    // إجمالي المخزون
    this.prisma.inventory.aggregate({
      _sum: { quantityAvailable: true },
      where: {
        ownerType: InventoryOwnerType.company,
        companyId,
      },
    }),

    // ✅ المنتجات منخفضة المخزون - الطريقة الصحيحة
    this.getLowStockProducts(companyId),

    // عدد طلبات العينات
    this.prisma.sampleRequest.count({
      where: { companyId, ...whereDate },
    }),

    // عدد المندوبين النشطين
    this.prisma.representativeProfile.count({
      where: { companyId, isActive: true },
    }),
  ]);

  // 4. جلب تفاصيل أفضل منتج مبيعاً
  let bestSellingProduct: {
    productId: string;
    nameAr: string;
    nameEn: string | null;
    totalQuantity: number;
  } | null = null;
  
  if (bestSellersRaw.length > 0) {
    const prod = await this.prisma.product.findUnique({
      where: { id: bestSellersRaw[0].productId },
      select: { id: true, nameAr: true, nameEn: true },
    });
    if (prod) {
      bestSellingProduct = {
        productId: prod.id,
        nameAr: prod.nameAr,
        nameEn: prod.nameEn,
        totalQuantity: bestSellersRaw[0]._sum.quantity ?? 0,
      };
    }
  }

  // 5. إرجاع النتائج
  return {
    totalSales: totalSales._sum.totalAmount?.toNumber() ?? 0,
    bestSellingProduct,
    totalInventory: totalInventory._sum.quantityAvailable ?? 0,
    lowStockProducts: lowStockProducts.map((inv) => ({
      productId: inv.product_id,
      nameAr: inv.name_ar,
      nameEn: inv.name_en,
      quantityAvailable: Number(inv.quantity_available),
      lowStockThreshold: Number(inv.low_stock_threshold),
    })),
    sampleRequestsCount,
    activeRepresentatives: activeReps,
  };
}


async getDistributorStats(
  distributorId: string,
  startDate?: string,
  endDate?: string,
) {
  // 1. التحقق من وجود الموزع
  const distributor = await this.prisma.distributorProfile.findUnique({
    where: { id: distributorId },
  });
  if (!distributor) throw new NotFoundException("Distributor not found");

  // 2. تجهيز فلتر التاريخ
  const dateFilter = this.dateFilter(startDate, endDate);
  const whereDate = { ...dateFilter };

  // 3. تنفيذ جميع الاستعلامات بشكل متوازي
  const [
    receivedOrders,
    pendingDelivery,
    totalRevenue,
    coveredAreas,
    ordersByDay,
    activeStaff,
    staffPerformance,
    inventoryTotal,
    stockMovementCount,
    bestSellersRaw,
  ] = await Promise.all([
    // عدد الطلبات المستلمة
    this.prisma.order.count({
      where: { distributorId, ...whereDate },
    }),

    // عدد الطلبات قيد التوصيل
    this.prisma.order.count({
      where: {
        distributorId,
        status: { in: [OrderStatus.approved, OrderStatus.in_delivery] },
        ...whereDate,
      },
    }),

    // إجمالي الإيرادات
    this.prisma.order.aggregate({
      _sum: { totalAmount: true },
      where: {
        distributorId,
        status: OrderStatus.delivered,
        ...whereDate,
      },
    }),

    // المناطق المغطاة
    this.prisma.distributorCoverageArea.findMany({
      where: { distributorId },
      select: { areaId: true },
      distinct: ["areaId"],
    }),

    // ✅ الطريقة الصحيحة للاستعلام الخام مع Supabase/PostgreSQL
    this.getOrdersByDayOfWeek(distributorId, startDate, endDate),

    // عدد الموظفين النشطين
    this.prisma.deliveryStaffProfile.count({
      where: { distributorId, isActive: true },
    }),

    // أداء الموظفين
    this.prisma.deliveryStaffProfile.findMany({
      where: { distributorId },
      select: {
        id: true,
        user: { select: { fullName: true } },
        _count: {
          select: {
            orders: { where: { status: OrderStatus.delivered, ...whereDate } },
          },
        },
      },
    }),

    // إجمالي المخزون
    this.prisma.inventory.aggregate({
      _sum: { quantityAvailable: true },
      where: {
        ownerType: InventoryOwnerType.distributor,
        distributorId,
      },
    }),

    // عدد حركات المخزون
    this.prisma.stockMovement.count({
      where: {
        ownerType: InventoryOwnerType.distributor,
        ...whereDate,
        inventory: { distributorId },
      },
    }),

    // أفضل 10 منتجات مبيعاً
    this.prisma.orderItem.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 10,
      where: {
        order: {
          distributorId,
          status: OrderStatus.delivered,
          ...whereDate,
        },
      },
    }),
  ]);

  // 4. جلب تفاصيل المنتجات الأكثر مبيعاً
  const bestSellerIds = bestSellersRaw.map((b) => b.productId);
  const products = bestSellerIds.length > 0
    ? await this.prisma.product.findMany({
        where: { id: { in: bestSellerIds } },
        select: { id: true, nameAr: true, nameEn: true },
      })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  // 5. إرجاع النتائج
  return {
    receivedOrders,
    pendingDeliveryOrders: pendingDelivery,
    totalRevenue: totalRevenue._sum.totalAmount?.toNumber() ?? 0,
    coveredAreasCount: coveredAreas.length,
    ordersByDayOfWeek: ordersByDay.map((d) => ({
      dayOfWeek: d.day_of_week.trim(),
      count: Number(d.count),
    })),
    activeDeliveryStaff: activeStaff,
    deliveryStaffPerformance: staffPerformance.map((s) => ({
      staffId: s.id,
      staffName: s.user.fullName,
      deliveredOrders: s._count.orders,
    })),
    currentInventory: inventoryTotal._sum.quantityAvailable ?? 0,
    stockMovements: stockMovementCount,
    bestSellingProducts: bestSellersRaw.map((b) => ({
      productId: b.productId,
      nameAr: productMap.get(b.productId)?.nameAr ?? "",
      nameEn: productMap.get(b.productId)?.nameEn ?? "",
      totalQuantity: b._sum.quantity ?? 0,
    })),
  };
}

// ✅ دالة مساعدة للاستعلام عن الطلبات حسب أيام الأسبوع
private async getOrdersByDayOfWeek(
  distributorId: string,
  startDate?: string,
  endDate?: string,
): Promise<Array<{ day_of_week: string; count: bigint }>> {
  // استخدام Prisma.sql مع Type Casting المناسب لـ UUID
  const query = Prisma.sql`
    SELECT 
      TO_CHAR(created_at, 'Day') as day_of_week, 
      COUNT(*)::bigint as count
    FROM orders
    WHERE distributor_id = ${distributorId}::uuid
    ${startDate ? Prisma.sql`AND created_at >= ${new Date(startDate)}` : Prisma.empty}
    ${endDate ? Prisma.sql`AND created_at <= ${new Date(endDate)}` : Prisma.empty}
    GROUP BY day_of_week
    ORDER BY MIN(EXTRACT(DOW FROM created_at))
  `;

  return this.prisma.$queryRaw(query);
}


// ✅ دالة مساعدة للاستعلام عن المنتجات منخفضة المخزون
private async getLowStockProducts(
  companyId: string,
): Promise<Array<{
  id: string;
  product_id: string;
  name_ar: string;
  name_en: string;
  quantity_available: number;
  low_stock_threshold: number;
}>> {
  // الطريقة 1: باستخدام Prisma.sql (الأفضل والأكثر أماناً)
  const query = Prisma.sql`
    SELECT 
      i.id, 
      i.product_id, 
      p.name_ar, 
      p.name_en, 
      i.quantity_available, 
      i.low_stock_threshold
    FROM inventories i
    JOIN products p ON p.id = i.product_id
    WHERE i.owner_type = 'company'
    AND i.company_id = ${companyId}::uuid
    AND i.quantity_available < i.low_stock_threshold
  `;

  return this.prisma.$queryRaw(query);
}

async getDoctorStats(userId: string) {
  const doctor = await this.prisma.doctorProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!doctor) throw new NotFoundException("Doctor profile not found");

  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  const [total, byStatusRaw, requestsLast30Days] = await Promise.all([
    this.prisma.sampleRequest.count({ where: { doctorId: doctor.id } }),
    this.prisma.sampleRequest.groupBy({
      by: ["status"],
      _count: { id: true },
      where: { doctorId: doctor.id },
    }),
    this.prisma.sampleRequest.count({
      where: { doctorId: doctor.id, createdAt: { gte: last30Days } },
    }),
  ]);

  const byStatus: Record<string, number> = {
    pending: 0,
    approved: 0,
    in_delivery: 0,
    delivered: 0,
    cancelled: 0,
    rejected: 0,
  };
  for (const row of byStatusRaw) byStatus[row.status] = row._count.id;

  return { totalRequests: total, byStatus, requestsLast30Days };
}

async getPharmacistStats(userId: string) {
  const pharmacist = await this.prisma.pharmacistProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!pharmacist) throw new NotFoundException("Pharmacist profile not found");

  const last30Days = new Date();
  last30Days.setDate(last30Days.getDate() - 30);

  const [totalOrders, ordersLast30Days, totalSpent, bestSellersRaw] =
    await Promise.all([
      this.prisma.order.count({ where: { pharmacistId: pharmacist.id } }),
      this.prisma.order.count({
        where: { pharmacistId: pharmacist.id, createdAt: { gte: last30Days } },
      }),
      this.prisma.order.aggregate({
        _sum: { totalAmount: true },
        where: { pharmacistId: pharmacist.id, status: OrderStatus.delivered },
      }),
      this.prisma.orderItem.groupBy({
        by: ["productId"],
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
        where: { order: { pharmacistId: pharmacist.id } },
      }),
    ]);

  const bestSellerIds = bestSellersRaw.map((b) => b.productId);
  const products =
    bestSellerIds.length > 0
      ? await this.prisma.product.findMany({
          where: { id: { in: bestSellerIds } },
          select: { id: true, nameAr: true, nameEn: true },
        })
      : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  return {
    totalOrders,
    ordersLast30Days,
    totalSpent: totalSpent._sum.totalAmount?.toNumber() ?? 0,
    topProducts: bestSellersRaw.map((b) => ({
      productId: b.productId,
      nameAr: productMap.get(b.productId)?.nameAr ?? "",
      nameEn: productMap.get(b.productId)?.nameEn ?? "",
      totalQuantity: b._sum.quantity ?? 0,
    })),
  };
}

}
