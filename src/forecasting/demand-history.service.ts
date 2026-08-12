import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';
import { buildDenseWeeklySeries, WeeklyPoint } from './week-utils';

export type ForecastScopeType = 'pharmacist' | 'distributor';

@Injectable()
export class DemandHistoryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Dense, zero-filled weekly order-quantity series per product for a scope
   * (a pharmacist's purchases, or a distributor's sales). Bucketing logic
   * MUST stay identical to the training script's (see week-utils.ts) or the
   * model sees a different input shape at inference than it was trained on.
   */
  async getWeeklySeries(scopeType: ForecastScopeType, scopeId: string): Promise<Map<string, WeeklyPoint[]>> {
    const where =
      scopeType === 'pharmacist'
        ? { status: OrderStatus.delivered, pharmacistId: scopeId }
        : { status: OrderStatus.delivered, distributorId: scopeId };

    const orders = await this.prisma.order.findMany({
      where,
      select: {
        createdAt: true,
        orderItems: { select: { productId: true, quantity: true } },
      },
    });

    const eventsByProduct = new Map<string, { date: Date; quantity: number }[]>();
    for (const order of orders) {
      for (const item of order.orderItems) {
        if (!eventsByProduct.has(item.productId)) eventsByProduct.set(item.productId, []);
        eventsByProduct.get(item.productId)!.push({ date: order.createdAt, quantity: item.quantity });
      }
    }

    const series = new Map<string, WeeklyPoint[]>();
    for (const [productId, events] of eventsByProduct) {
      series.set(productId, buildDenseWeeklySeries(events));
    }
    return series;
  }

  /** The distributor a pharmacist has most frequently ordered a given product from. */
  async getPreferredDistributor(pharmacistId: string, productId: string): Promise<string | null> {
    const grouped = await this.prisma.order.groupBy({
      by: ['distributorId'],
      where: {
        pharmacistId,
        status: OrderStatus.delivered,
        distributorId: { not: null },
        orderItems: { some: { productId } },
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    });
    return grouped[0]?.distributorId ?? null;
  }
}
