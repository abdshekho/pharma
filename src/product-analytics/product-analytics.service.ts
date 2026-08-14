import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InventoryOwnerType, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProductAnalyticsQueryDto,
  ProductSalesQueryDto,
} from './dto/product-analytics-query.dto';

export interface SalesAgg {
  orders: number;
  units: number;
  revenue: number;
}

export interface MonthlyRow {
  month: string;
  units: number;
  revenue: number;
}

interface CustomerRow {
  id: string;
  orders: number;
  units: number;
  revenue: number;
  first_order_at: Date;
  last_order_at: Date;
}

interface DoctorRow {
  id: string;
  requests: number;
  units: number;
  last_request_at: Date;
}

export interface PromotionAnalytics {
  id: string;
  title: string;
  type: string;
  level: string;
  startsAt: Date;
  endsAt: Date;
  isActive: boolean;
  status: 'upcoming' | 'active' | 'ended';
  discountPercent: number | null;
  buyXgetY: {
    buyQuantity: number;
    freeQuantity: number;
    isBuyProduct: boolean;
  } | null;
  impact: {
    beforeUnits: number;
    duringUnits: number;
    changeUnits: number;
    changePercent: number;
    beforeRevenue: number;
    duringRevenue: number;
    changeRevenue: number;
  };
}

const PERIOD_DAYS: Record<string, number> = {
  month: 30,
  quarter: 90,
  year: 365,
};

@Injectable()
export class ProductAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ============================ Helpers ============================

  private round(n: number, digits = 2): number {
    const f = 10 ** digits;
    return Math.round((n + Number.EPSILON) * f) / f;
  }

  private periodStart(end: Date, days: number): Date {
    return new Date(end.getTime() - days * 86400000);
  }

  private async getProductOrFail(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, nameAr: true, nameEn: true, companyId: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async assertCompanyAccess(user: any, companyId: string) {
    if (user?.role === UserRole.admin) return;
    if (user?.role === UserRole.company) {
      const profile = await this.prisma.companyProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (!profile || profile.id !== companyId) {
        throw new ForbiddenException('You do not have access to this product');
      }
      return;
    }
    throw new ForbiddenException('Access denied');
  }

  /** مبيعات الشركة (من الموزعين) للمنتج في نافذة زمنية */
  private async companySales(
    productId: string,
    start: Date,
    end: Date,
  ): Promise<SalesAgg> {
    const rows = await this.prisma.$queryRaw<Array<Partial<SalesAgg>>>(
      Prisma.sql`
        SELECT
          COUNT(DISTINCT o.id)::int AS orders,
          COALESCE(SUM(oi.quantity), 0)::int AS units,
          COALESCE(SUM(oi.subtotal - COALESCE(oi.discount_amount, 0)), 0)::float8 AS revenue
        FROM company_distributor_order_items oi
        JOIN company_distributor_orders o ON o.id = oi.order_id
        WHERE oi.product_id = ${productId}::uuid
          AND o.status = 'delivered'
          AND o.created_at >= ${start}
          AND o.created_at < ${end}
      `,
    );
    const r = rows[0] ?? {};
    return {
      orders: Number(r.orders) || 0,
      units: Number(r.units) || 0,
      revenue: this.round(Number(r.revenue) || 0),
    };
  }

  /** طلب الصيادلة من الموزعين للمنتج (الطلب السوقي) */
  private async pharmacistDemand(
    productId: string,
    start: Date,
    end: Date,
  ): Promise<SalesAgg> {
    const rows = await this.prisma.$queryRaw<Array<Partial<SalesAgg>>>(
      Prisma.sql`
        SELECT
          COUNT(DISTINCT o.id)::int AS orders,
          COALESCE(SUM(oi.quantity), 0)::int AS units,
          COALESCE(SUM(oi.subtotal - COALESCE(oi.discount_amount, 0)), 0)::float8 AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = ${productId}::uuid
          AND o.status = 'delivered'
          AND o.created_at >= ${start}
          AND o.created_at < ${end}
      `,
    );
    const r = rows[0] ?? {};
    return {
      orders: Number(r.orders) || 0,
      units: Number(r.units) || 0,
      revenue: this.round(Number(r.revenue) || 0),
    };
  }

  /** مبيعات الشركة شهرياً */
  private async monthlyCompanySales(
    productId: string,
    start: Date,
  ): Promise<MonthlyRow[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ month: string; units: number; revenue: number }>
    >(
      Prisma.sql`
        SELECT
          TO_CHAR(DATE_TRUNC('month', o.created_at), 'YYYY-MM') AS month,
          COALESCE(SUM(oi.quantity), 0)::int AS units,
          COALESCE(SUM(oi.subtotal - COALESCE(oi.discount_amount, 0)), 0)::float8 AS revenue
        FROM company_distributor_order_items oi
        JOIN company_distributor_orders o ON o.id = oi.order_id
        WHERE oi.product_id = ${productId}::uuid
          AND o.status = 'delivered'
          AND o.created_at >= ${start}
        GROUP BY month
        ORDER BY month
      `,
    );
    return rows.map((r) => ({
      month: r.month,
      units: Number(r.units) || 0,
      revenue: this.round(Number(r.revenue) || 0),
    }));
  }

  /** تعبئة السلسلة الشهرية بالأشهر الناقصة (بصفر) */
  private fillMonthlySeries(
    start: Date,
    end: Date,
    rows: MonthlyRow[],
  ): MonthlyRow[] {
    const map = new Map(rows.map((r) => [r.month, r]));
    const result: MonthlyRow[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= last) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const row = map.get(key);
      result.push(row ?? { month: key, units: 0, revenue: 0 });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }

  private addMonths(monthKey: string, delta: number): string {
    const [y, m] = monthKey.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private changePercent(current: number, previous: number): number {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  }

  /** انحدار خطي بسيط للتنبؤ */
  private linearForecast(
    points: MonthlyRow[],
    steps: number,
  ): { month: string; forecastUnits: number }[] {
    const n = points.length;
    if (n === 0) return [];
    const xs = points.map((_, i) => i);
    const ys = points.map((p) => p.units);
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let ssxx = 0;
    let ssxy = 0;
    for (let i = 0; i < n; i++) {
      ssxx += (xs[i] - meanX) ** 2;
      ssxy += (xs[i] - meanX) * (ys[i] - meanY);
    }
    const slope = ssxx === 0 ? 0 : ssxy / ssxx;
    const intercept = meanY - slope * meanX;
    const lastMonth = points[n - 1].month;
    const result: { month: string; forecastUnits: number }[] = [];
    for (let s = 1; s <= steps; s++) {
      const predicted = intercept + slope * (n - 1 + s);
      result.push({
        month: this.addMonths(lastMonth, s),
        forecastUnits: Math.max(0, Math.round(predicted)),
      });
    }
    return result;
  }

  // ============================ 1) Sales basic ============================

  async getSalesBasic(
    productId: string,
    query: ProductSalesQueryDto,
    user: any,
  ) {
    const product = await this.getProductOrFail(productId);
    await this.assertCompanyAccess(user, product.companyId);

    const compareWith = query.compareWith ?? 'month';
    const now = new Date();

    let currentStart: Date;
    let currentEnd: Date;
    if (query.startDate && query.endDate) {
      currentStart = new Date(query.startDate);
      currentEnd = new Date(query.endDate);
    } else {
      currentEnd = now;
      currentStart = this.periodStart(now, PERIOD_DAYS[compareWith]);
    }

    const windowMs = currentEnd.getTime() - currentStart.getTime();
    const previousEnd = new Date(currentStart);
    const previousStart = new Date(previousEnd.getTime() - windowMs);

    const months = query.months ?? 12;
    const monthlyStart = new Date(currentEnd);
    monthlyStart.setDate(1);
    monthlyStart.setMonth(monthlyStart.getMonth() - (months - 1));

    const [current, previous, demand, monthly] = await Promise.all([
      this.companySales(productId, currentStart, currentEnd),
      this.companySales(productId, previousStart, previousEnd),
      this.pharmacistDemand(productId, currentStart, currentEnd),
      this.monthlyCompanySales(productId, monthlyStart),
    ]);

    const unitsChangePercent = this.changePercent(current.units, previous.units);
    const revenueChangePercent = this.changePercent(
      current.revenue,
      previous.revenue,
    );
    const direction =
      unitsChangePercent > 5
        ? 'up'
        : unitsChangePercent < -5
          ? 'down'
          : 'stable';

    return {
      product,
      period: {
        label:
          query.startDate && query.endDate ? 'custom' : compareWith,
        current: { start: currentStart, end: currentEnd },
        previous: { start: previousStart, end: previousEnd },
      },
      current,
      previous,
      comparison: {
        unitsChangePercent: this.round(unitsChangePercent),
        revenueChangePercent: this.round(revenueChangePercent),
        unitsDifference: current.units - previous.units,
        revenueDifference: this.round(current.revenue - previous.revenue),
        direction,
      },
      pharmacistDemand: demand,
      monthlySeries: this.fillMonthlySeries(
        monthlyStart,
        currentEnd,
        monthly,
      ),
    };
  }

  // ============================ 2) Customers ============================

  async getCustomers(
    productId: string,
    query: ProductAnalyticsQueryDto,
    user: any,
  ) {
    const product = await this.getProductOrFail(productId);
    await this.assertCompanyAccess(user, product.companyId);

    const now = new Date();
    const cutoff = new Date(now.getTime() - 90 * 86400000);

    const pharmacistRows = await this.prisma.$queryRaw<CustomerRow[]>(
      Prisma.sql`
        SELECT
          o.pharmacist_id AS id,
          COUNT(*)::int AS orders,
          COALESCE(SUM(oi.quantity), 0)::int AS units,
          COALESCE(SUM(oi.subtotal - COALESCE(oi.discount_amount, 0)), 0)::float8 AS revenue,
          MIN(o.created_at) AS first_order_at,
          MAX(o.created_at) AS last_order_at
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        WHERE oi.product_id = ${productId}::uuid
          AND o.status = 'delivered'
        GROUP BY o.pharmacist_id
      `,
    );

    const pharmacistIds = pharmacistRows.map((r) => r.id);
    const pharmacistProfiles = pharmacistIds.length
      ? await this.prisma.pharmacistProfile.findMany({
          where: { id: { in: pharmacistIds } },
          select: {
            id: true,
            pharmacyName: true,
            area: {
              select: {
                nameAr: true,
                city: { select: { nameAr: true } },
              },
            },
            user: {
              select: { fullName: true, phone: true, status: true },
            },
          },
        })
      : [];
    const profileMap = new Map(pharmacistProfiles.map((p) => [p.id, p]));

    const pharmacistDetails = pharmacistRows.map((r) => {
      const p = profileMap.get(r.id);
      const firstOrderAt = new Date(r.first_order_at);
      const lastOrderAt = new Date(r.last_order_at);
      let segment: 'new' | 'active' | 'atRisk';
      if (firstOrderAt >= cutoff) segment = 'new';
      else if (lastOrderAt >= cutoff) segment = 'active';
      else segment = 'atRisk';
      return {
        pharmacistId: r.id,
        pharmacyName: p?.pharmacyName ?? null,
        pharmacistName: p?.user.fullName ?? null,
        phone: p?.user.phone ?? null,
        city: p?.area?.city?.nameAr ?? null,
        area: p?.area?.nameAr ?? null,
        segment,
        orders: r.orders,
        units: r.units,
        revenue: this.round(Number(r.revenue) || 0),
        firstOrderAt,
        lastOrderAt,
      };
    });

    const doctorRows = await this.prisma.$queryRaw<DoctorRow[]>(
      Prisma.sql`
        SELECT
          sr.doctor_id AS id,
          COUNT(*)::int AS requests,
          COALESCE(SUM(sr.quantity), 0)::int AS units,
          MAX(sr.created_at) AS last_request_at
        FROM sample_requests sr
        WHERE sr.product_id = ${productId}::uuid
          AND sr.status NOT IN ('cancelled', 'rejected')
        GROUP BY sr.doctor_id
      `,
    );

    const doctorIds = doctorRows.map((r) => r.id);
    const doctorProfiles = doctorIds.length
      ? await this.prisma.doctorProfile.findMany({
          where: { id: { in: doctorIds } },
          select: {
            id: true,
            hospitalName: true,
            specialization: { select: { nameAr: true } },
            user: {
              select: {
                fullName: true,
                phone: true,
                city: { select: { nameAr: true } },
              },
            },
          },
        })
      : [];
    const doctorMap = new Map(doctorProfiles.map((d) => [d.id, d]));

    const doctorDetails = doctorRows.map((r) => {
      const d = doctorMap.get(r.id);
      return {
        doctorId: r.id,
        doctorName: d?.user.fullName ?? null,
        hospital: d?.hospitalName ?? null,
        specialization: d?.specialization?.nameAr ?? null,
        city: d?.user.city?.nameAr ?? null,
        requests: r.requests,
        units: r.units,
        lastRequestAt: new Date(r.last_request_at),
      };
    });

    const bySpecialization = new Map<string, number>();
    const byRegion = new Map<string, number>();
    for (const d of doctorDetails) {
      const spec = d.specialization ?? 'غير محدد';
      const city = d.city ?? 'غير محدد';
      bySpecialization.set(spec, (bySpecialization.get(spec) ?? 0) + 1);
      byRegion.set(city, (byRegion.get(city) ?? 0) + 1);
    }

    return {
      product,
      pharmacists: {
        total: pharmacistDetails.length,
        active: pharmacistDetails.filter((d) => d.segment === 'active').length,
        new: pharmacistDetails.filter((d) => d.segment === 'new').length,
        atRisk: pharmacistDetails.filter((d) => d.segment === 'atRisk').length,
        details: pharmacistDetails,
      },
      doctors: {
        total: doctorDetails.length,
        totalRequests: doctorRows.reduce((a, r) => a + r.requests, 0),
        bySpecialization: [...bySpecialization.entries()]
          .map(([specialization, count]) => ({ specialization, count }))
          .sort((a, b) => b.count - a.count),
        byRegion: [...byRegion.entries()]
          .map(([city, count]) => ({ city, count }))
          .sort((a, b) => b.count - a.count),
        details: doctorDetails,
      },
    };
  }

  // ============================ 3) Geographic ============================

  async getGeographic(
    productId: string,
    query: ProductAnalyticsQueryDto,
    user: any,
  ) {
    const product = await this.getProductOrFail(productId);
    await this.assertCompanyAccess(user, product.companyId);

    const now = new Date();
    const start = query.startDate
      ? new Date(query.startDate)
      : this.periodStart(now, 365);

    const cityRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        city: string;
        pharmacists: number;
        orders: number;
        units: number;
        revenue: number;
      }>
    >(
      Prisma.sql`
        SELECT
          c.id,
          c.name_ar AS city,
          COUNT(DISTINCT o.pharmacist_id)::int AS pharmacists,
          COUNT(DISTINCT o.id)::int AS orders,
          COALESCE(SUM(oi.quantity), 0)::int AS units,
          COALESCE(SUM(oi.subtotal - COALESCE(oi.discount_amount, 0)), 0)::float8 AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        JOIN cities c ON c.id = o.city_id
        WHERE oi.product_id = ${productId}::uuid
          AND o.status = 'delivered'
          AND o.created_at >= ${start}
        GROUP BY c.id, c.name_ar
        ORDER BY units DESC
      `,
    );

    const areaRows = await this.prisma.$queryRaw<
      Array<{
        id: string | null;
        area: string | null;
        city: string | null;
        pharmacists: number;
        orders: number;
        units: number;
        revenue: number;
      }>
    >(
      Prisma.sql`
        SELECT
          a.id,
          a.name_ar AS area,
          c.name_ar AS city,
          COUNT(DISTINCT o.pharmacist_id)::int AS pharmacists,
          COUNT(DISTINCT o.id)::int AS orders,
          COALESCE(SUM(oi.quantity), 0)::int AS units,
          COALESCE(SUM(oi.subtotal - COALESCE(oi.discount_amount, 0)), 0)::float8 AS revenue
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
        LEFT JOIN city_areas a ON a.id = o.area_id
        LEFT JOIN cities c ON c.id = o.city_id
        WHERE oi.product_id = ${productId}::uuid
          AND o.status = 'delivered'
          AND o.created_at >= ${start}
        GROUP BY a.id, a.name_ar, c.name_ar
        ORDER BY units DESC
      `,
    );

    const salesByCity = cityRows.map((c) => ({
      cityId: c.id,
      city: c.city,
      pharmacists: c.pharmacists,
      orders: c.orders,
      units: c.units,
      revenue: this.round(Number(c.revenue) || 0),
    }));

    const salesByArea = areaRows.map((a) => ({
      areaId: a.id,
      area: a.area ?? 'غير محدد',
      city: a.city ?? 'غير محدد',
      pharmacists: a.pharmacists,
      orders: a.orders,
      units: a.units,
      revenue: this.round(Number(a.revenue) || 0),
    }));

    const avgAreaUnits =
      salesByArea.length === 0
        ? 0
        : salesByArea.reduce((s, a) => s + a.units, 0) / salesByArea.length;

    const mapData = new Map<
      string,
      {
        city: string;
        units: number;
        revenue: number;
        orders: number;
        areas: { area: string; units: number }[];
      }
    >();
    for (const a of salesByArea) {
      const entry = mapData.get(a.city) ?? {
        city: a.city,
        units: 0,
        revenue: 0,
        orders: 0,
        areas: [],
      };
      entry.units += a.units;
      entry.revenue += a.revenue;
      entry.orders += a.orders;
      entry.areas.push({ area: a.area, units: a.units });
      mapData.set(a.city, entry);
    }

    return {
      product,
      period: { start, end: now },
      mostRequestedCities: salesByCity.slice(0, 5),
      salesByCity,
      salesByArea,
      activeAreas: salesByArea.filter((a) => avgAreaUnits > 0 && a.units >= avgAreaUnits),
      weakAreas: salesByArea.filter((a) => avgAreaUnits > 0 && a.units < avgAreaUnits),
      mapData: [...mapData.values()].sort((a, b) => b.units - a.units),
    };
  }

  // ============================ 4) Growth ============================

  async getGrowth(
    productId: string,
    query: ProductAnalyticsQueryDto,
    user: any,
  ) {
    const product = await this.getProductOrFail(productId);
    await this.assertCompanyAccess(user, product.companyId);

    const now = new Date();
    const months = query.months ?? 24;
    const seasonStart = new Date(now);
    seasonStart.setDate(1);
    seasonStart.setMonth(seasonStart.getMonth() - (months - 1));

    const [monthly, annualNow, annualPrev] = await Promise.all([
      this.monthlyCompanySales(productId, seasonStart),
      this.companySales(productId, this.periodStart(now, 365), now),
      this.companySales(
        productId,
        this.periodStart(this.periodStart(now, 365), 365),
        this.periodStart(now, 365),
      ),
    ]);

    const filled = this.fillMonthlySeries(seasonStart, now, monthly);

    // معدل النمو الشهري (آخر شهر مقابل الذي قبله)
    const last = filled[filled.length - 1];
    const prev = filled[filled.length - 2] ?? { units: 0 };
    const monthlyGrowthPercent = this.changePercent(last.units, prev.units);

    // معدل النمو السنوي
    const annualGrowthPercent = this.changePercent(
      annualNow.units,
      annualPrev.units,
    );

    // الموسمية حسب الشهر (متوسط الوحدات لكل شهر ميلادي)
    const perMonthAverages = new Map<number, number[]>();
    for (const r of filled) {
      const m = Number(r.month.split('-')[1]);
      const arr = perMonthAverages.get(m) ?? [];
      arr.push(r.units);
      perMonthAverages.set(m, arr);
    }
    const seasonality = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
      const arr = perMonthAverages.get(m) ?? [0];
      const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
      return { month: m, avgUnits: this.round(avg), sharePct: 0 };
    });
    const totalAvg = seasonality.reduce((s, x) => s + x.avgUnits, 0);
    for (const s of seasonality) {
      s.sharePct = totalAvg > 0 ? this.round((s.avgUnits / totalAvg) * 100) : 0;
    }
    const peakMonths = [...seasonality]
      .sort((a, b) => b.avgUnits - a.avgUnits)
      .slice(0, 3);
    const slowMonths = [...seasonality]
      .sort((a, b) => a.avgUnits - b.avgUnits)
      .slice(0, 3);

    // فترات الركود (أشهر أقل من 60% من المتوسط الشهري)
    const avgMonthly = filled.reduce((s, r) => s + r.units, 0) / filled.length;
    const recessions = filled
      .filter((r) => avgMonthly > 0 && r.units < avgMonthly * 0.6)
      .map((r) => ({
        month: r.month,
        units: r.units,
        averageUnits: this.round(avgMonthly),
      }));

    // توقع المبيعات (انحدار خطي على آخر 12 شهر)
    const history = filled.slice(-12);
    const forecast = this.linearForecast(history, 3);

    const forecastTrend =
      forecast.length >= 2 &&
      forecast[forecast.length - 1].forecastUnits > forecast[0].forecastUnits
        ? 'rising'
        : forecast.length >= 2 &&
            forecast[forecast.length - 1].forecastUnits <
              forecast[0].forecastUnits
          ? 'falling'
          : 'stable';

    return {
      product,
      monthlyGrowth: {
        percent: this.round(monthlyGrowthPercent),
        currentUnits: last.units,
        previousUnits: prev.units,
      },
      annualGrowth: {
        percent: this.round(annualGrowthPercent),
        currentUnits: annualNow.units,
        previousUnits: annualPrev.units,
      },
      seasonality: {
        monthly: seasonality,
        peakMonths,
        slowMonths,
      },
      recessions,
      forecast: {
        method: 'linear-regression',
        nextMonths: forecast,
        trend: forecastTrend,
      },
    };
  }

  // ============================ 5) Inventory ============================

  async getInventory(
    productId: string,
    query: ProductAnalyticsQueryDto,
    user: any,
  ) {
    const product = await this.getProductOrFail(productId);
    await this.assertCompanyAccess(user, product.companyId);

    const summaryRows = await this.prisma.$queryRaw<
      Array<{
        owner_type: string;
        locations: number;
        units: number;
        free_units: number;
      }>
    >(
      Prisma.sql`
        SELECT
          owner_type,
          COUNT(*)::int AS locations,
          COALESCE(SUM(quantity_available), 0)::int AS units,
          COALESCE(SUM(free_quantity), 0)::int AS free_units
        FROM inventories
        WHERE product_id = ${productId}::uuid
        GROUP BY owner_type
      `,
    );

    const byRegion = await this.prisma.$queryRaw<
      Array<{ city: string; area: string; locations: number; units: number }>
    >(
      Prisma.sql`
        SELECT
          COALESCE(c.name_ar, 'غير محدد') AS city,
          COALESCE(a.name_ar, 'غير محدد') AS area,
          COUNT(*)::int AS locations,
          COALESCE(SUM(i.quantity_available), 0)::int AS units
        FROM inventories i
        LEFT JOIN pharmacist_profiles pp ON pp.id = i.pharmacist_id
        LEFT JOIN city_areas a ON a.id = pp.area_id
        LEFT JOIN cities c ON c.id = a.city_id
        WHERE i.product_id = ${productId}::uuid
          AND i.owner_type = 'pharmacist'
        GROUP BY c.name_ar, a.name_ar
        ORDER BY units DESC
      `,
    );

    const byDistributor = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; units: number; free_units: number }>
    >(
      Prisma.sql`
        SELECT
          i.distributor_id AS id,
          d.company_name AS name,
          COALESCE(SUM(i.quantity_available), 0)::int AS units,
          COALESCE(SUM(i.free_quantity), 0)::int AS free_units
        FROM inventories i
        JOIN distributor_profiles d ON d.id = i.distributor_id
        WHERE i.product_id = ${productId}::uuid
          AND i.owner_type = 'distributor'
        GROUP BY i.distributor_id, d.company_name
        ORDER BY units DESC
      `,
    );

    const companyStock = await this.prisma.inventory.findFirst({
      where: { productId, ownerType: InventoryOwnerType.company },
      select: {
        quantityAvailable: true,
        freeQuantity: true,
        lowStockThreshold: true,
        lastUpdated: true,
      },
    });

    const lowStockRows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        owner_type: string;
        owner_name: string;
        quantity_available: number;
        low_stock_threshold: number;
        last_updated: Date;
      }>
    >(
      Prisma.sql`
        SELECT
          i.id,
          i.owner_type,
          COALESCE(pp.pharmacy_name, d.company_name, cp.company_name, '') AS owner_name,
          i.quantity_available,
          i.low_stock_threshold,
          i.last_updated
        FROM inventories i
        LEFT JOIN pharmacist_profiles pp ON pp.id = i.pharmacist_id
        LEFT JOIN distributor_profiles d ON d.id = i.distributor_id
        LEFT JOIN company_profiles cp ON cp.id = i.company_id
        WHERE i.product_id = ${productId}::uuid
          AND i.quantity_available < i.low_stock_threshold
        ORDER BY (i.low_stock_threshold - i.quantity_available) DESC
      `,
    );

    const summary: Record<string, { locations: number; units: number; freeUnits: number }> = {
      company: { locations: 0, units: 0, freeUnits: 0 },
      distributor: { locations: 0, units: 0, freeUnits: 0 },
      pharmacist: { locations: 0, units: 0, freeUnits: 0 },
    };
    let totalUnits = 0;
    for (const row of summaryRows) {
      const s = summary[row.owner_type] ?? {
        locations: 0,
        units: 0,
        freeUnits: 0,
      };
      s.locations += row.locations;
      s.units += row.units;
      s.freeUnits += row.free_units;
      totalUnits += row.units;
    }

    return {
      product,
      summary: { ...summary, totalUnits },
      companyStock: companyStock
        ? {
            units: companyStock.quantityAvailable,
            freeUnits: companyStock.freeQuantity,
            lowStockThreshold: companyStock.lowStockThreshold,
            lastUpdated: companyStock.lastUpdated,
          }
        : null,
      byRegion: byRegion.map((r) => ({
        city: r.city,
        area: r.area,
        locations: r.locations,
        units: r.units,
      })),
      byDistributor: byDistributor.map((r) => ({
        distributorId: r.id,
        distributorName: r.name,
        units: r.units,
        freeUnits: r.free_units,
      })),
      lowStock: {
        total: lowStockRows.length,
        alerts: lowStockRows.map((r) => ({
          inventoryId: r.id,
          ownerType: r.owner_type,
          ownerName: r.owner_name,
          units: r.quantity_available,
          lowStockThreshold: r.low_stock_threshold,
          shortage: r.low_stock_threshold - r.quantity_available,
          lastUpdated: new Date(r.last_updated),
        })),
      },
    };
  }

  // ============================ 6) Promotions ============================

  async getPromotions(
    productId: string,
    query: ProductAnalyticsQueryDto,
    user: any,
  ) {
    const product = await this.getProductOrFail(productId);
    await this.assertCompanyAccess(user, product.companyId);

    const promotions = await this.prisma.promotion.findMany({
      where: {
        OR: [
          { promotionProducts: { some: { productId } } },
          { buyXgetY: { buyProductId: productId } },
          { buyXgetY: { freeProductId: productId } },
        ],
      },
      select: {
        id: true,
        title: true,
        type: true,
        level: true,
        startsAt: true,
        endsAt: true,
        isActive: true,
        createdAt: true,
        promotionProducts: {
          select: { productId: true, discountPercent: true },
        },
        buyXgetY: {
          select: {
            buyProductId: true,
            buyQuantity: true,
            freeProductId: true,
            freeQuantity: true,
          },
        },
      },
      orderBy: { startsAt: 'desc' },
    });

    const now = new Date();
    const withImpact: PromotionAnalytics[] = [];

    for (const promo of promotions) {
      const effectiveEnd = promo.endsAt < now ? promo.endsAt : now;
      const duringStart = new Date(promo.startsAt);
      const windowLen = effectiveEnd.getTime() - duringStart.getTime();
      const beforeEnd = new Date(duringStart);
      const beforeStart =
        windowLen > 0
          ? new Date(duringStart.getTime() - windowLen)
          : new Date(duringStart.getTime() - 30 * 86400000);

      const [before, during] = await Promise.all([
        this.companySales(productId, beforeStart, beforeEnd),
        this.companySales(productId, duringStart, effectiveEnd),
      ]);

      const pp = promo.promotionProducts.find(
        (p) => p.productId === productId,
      );
      const status =
        promo.startsAt > now
          ? 'upcoming'
          : promo.endsAt < now
            ? 'ended'
            : 'active';

      withImpact.push({
        id: promo.id,
        title: promo.title,
        type: promo.type,
        level: promo.level,
        startsAt: promo.startsAt,
        endsAt: promo.endsAt,
        isActive: promo.isActive,
        status,
        discountPercent: pp?.discountPercent?.toNumber() ?? null,
        buyXgetY: promo.buyXgetY
          ? {
              buyQuantity: promo.buyXgetY.buyQuantity,
              freeQuantity: promo.buyXgetY.freeQuantity,
              isBuyProduct: promo.buyXgetY.buyProductId === productId,
            }
          : null,
        impact: {
          beforeUnits: before.units,
          duringUnits: during.units,
          changeUnits: during.units - before.units,
          changePercent: this.round(
            this.changePercent(during.units, before.units),
          ),
          beforeRevenue: before.revenue,
          duringRevenue: during.revenue,
          changeRevenue: this.round(during.revenue - before.revenue),
        },
      });
    }

    const withActivity = withImpact.filter(
      (p) => p.impact.beforeUnits > 0 || p.impact.duringUnits > 0,
    );
    const bestPerforming = withActivity
      .filter((p) => p.status !== 'upcoming')
      .sort((a, b) => b.impact.changePercent - a.impact.changePercent)
      .slice(0, 3);

    // توصيات
    const recommendations: string[] = [];
    if (withImpact.length === 0) {
      recommendations.push(
        'لا توجد عروض ترويجية لهذا المنتج بعد؛ يُنصح بإطلاق عرض تجريبي لتقييم أثره على المبيعات',
      );
    }

    const [trendNow, trendPrev] = await Promise.all([
      this.companySales(productId, this.periodStart(now, 30), now),
      this.companySales(
        productId,
        this.periodStart(this.periodStart(now, 30), 30),
        this.periodStart(now, 30),
      ),
    ]);
    const hasActivePromo = withImpact.some((p) => p.status === 'active');
    if (
      trendPrev.units > 0 &&
      trendNow.units < trendPrev.units &&
      !hasActivePromo
    ) {
      recommendations.push(
        'تراجع المبيعات خلال آخر 30 يوماً مع عدم وجود عروض نشطة؛ اقترح عرض خصم عاجل لتحفيز الطلب',
      );
    }

    if (bestPerforming[0] && bestPerforming[0].impact.beforeUnits > 0) {
      recommendations.push(
        `أفضل عرض كان «${bestPerforming[0].title}» بزيادة ${this.round(bestPerforming[0].impact.changePercent)}% في الوحدات المباعة؛ يُنصح بتكراره أو توسيعه`,
      );
    }

    const distStock = await this.prisma.inventory.aggregate({
      where: { productId, ownerType: InventoryOwnerType.distributor },
      _sum: { quantityAvailable: true },
    });
    const distUnits = distStock._sum.quantityAvailable ?? 0;
    if (distUnits > 0) {
      recommendations.push(
        `مخزون الموزعين مرتفع (${distUnits} وحدة)؛ اقترح عرضاً ترويجياً لتصريف المخزون وزيادة الدوران`,
      );
    }

    const lowStockCount = await this.prisma.$queryRaw<
      Array<{ c: number }>
    >(
      Prisma.sql`
        SELECT COUNT(*)::int AS c
        FROM inventories
        WHERE product_id = ${productId}::uuid
          AND quantity_available < low_stock_threshold
      `,
    );
    if ((lowStockCount[0]?.c ?? 0) > 0) {
      recommendations.push(
        'يوجد نقص في المخزون لدى بعض الموزعين/الصيادلة؛ أعد تزويد المخزون قبل إطلاق أي عرض جديد',
      );
    }

    return {
      product,
      counts: {
        total: withImpact.length,
        active: withImpact.filter((p) => p.status === 'active').length,
        upcoming: withImpact.filter((p) => p.status === 'upcoming').length,
        ended: withImpact.filter((p) => p.status === 'ended').length,
      },
      promotions: withImpact,
      bestPerforming,
      recommendations,
    };
  }
}
