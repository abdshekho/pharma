import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DemandHistoryService } from './demand-history.service';
import { ForecastModelService } from './forecast-model.service';

export interface ForecastableSuggestion {
  productId: string;
  nameAr: string;
  imageUrl: string | null;
  forecastAvailable: true;
  predictedWeeklyDemand: number;
  currentStock: number;
  suggestedReorderQty: number;
  daysUntilStockout: number | null;
  preferredDistributorId: string | null;
}

export interface UnavailableSuggestion {
  productId: string;
  nameAr: string;
  imageUrl: string | null;
  forecastAvailable: false;
  reason: 'INSUFFICIENT_HISTORY';
}

export type ReorderSuggestionResult = ForecastableSuggestion | UnavailableSuggestion;

export interface DistributorForecastProduct {
  productId: string;
  nameAr: string;
  history: number[];
  predictedNextWeek: number;
}

export interface DistributorForecastResult {
  products: DistributorForecastProduct[];
  totalPredictedDemand: number;
  restockSoonCount: number;
}

@Injectable()
export class ReorderRecommendationService {
  constructor(
    private prisma: PrismaService,
    private demandHistory: DemandHistoryService,
    private forecastModel: ForecastModelService,
  ) {}

  async getPharmacistReorderSuggestions(pharmacistId: string): Promise<ReorderSuggestionResult[]> {
    const series = await this.demandHistory.getWeeklySeries('pharmacist', pharmacistId);
    const windowSize = this.forecastModel.windowSize;

    const available: ForecastableSuggestion[] = [];
    const unavailable: UnavailableSuggestion[] = [];

    for (const [productId, points] of series) {
      const product = await this.prisma.product.findUnique({
        where: { id: productId },
        select: { nameAr: true, imageUrl: true },
      });
      if (!product) continue;

      // Products pharmacist bought -> recent demand -> has >= WINDOW_SIZE weeks?
      if (points.length < windowSize || !this.forecastModel.isReady()) {
        unavailable.push({
          productId,
          nameAr: product.nameAr,
          imageUrl: product.imageUrl,
          forecastAvailable: false,
          reason: 'INSUFFICIENT_HISTORY',
        });
        continue;
      }

      // Forecast
      const lastWindow = points.slice(-windowSize).map((p) => p.quantity);
      const nextWeekDate = new Date(points[points.length - 1].weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const predictedWeeklyDemand = this.forecastModel.predictNextWeek(lastWindow, nextWeekDate);

      // Inventory
      const inventory = await this.prisma.inventory.findUnique({
        where: { pharmacistId_productId: { pharmacistId, productId } },
      });
      const currentStock = inventory?.quantityAvailable ?? 0;

      // Calculate urgency
      const suggestedReorderQty = Math.max(0, predictedWeeklyDemand - currentStock);
      const daysUntilStockout =
        predictedWeeklyDemand > 0 ? Math.round((currentStock / predictedWeeklyDemand) * 7) : null;

      const preferredDistributorId = await this.demandHistory.getPreferredDistributor(pharmacistId, productId);

      available.push({
        productId,
        nameAr: product.nameAr,
        imageUrl: product.imageUrl,
        forecastAvailable: true,
        predictedWeeklyDemand,
        currentStock,
        suggestedReorderQty,
        daysUntilStockout,
        preferredDistributorId,
      });
    }

    // Sort by urgency (soonest stockout first), nulls last; unavailable items follow, visible but not competing.
    available.sort((a, b) => {
      if (a.daysUntilStockout === null && b.daysUntilStockout === null) return 0;
      if (a.daysUntilStockout === null) return 1;
      if (b.daysUntilStockout === null) return -1;
      return a.daysUntilStockout - b.daysUntilStockout;
    });

    return [...available, ...unavailable];
  }

  async getDistributorForecast(distributorId: string): Promise<DistributorForecastResult> {
    const series = await this.demandHistory.getWeeklySeries('distributor', distributorId);
    const windowSize = this.forecastModel.windowSize;

    const ranked = Array.from(series.entries())
      .filter(([, points]) => points.length >= windowSize && this.forecastModel.isReady())
      .map(([productId, points]) => ({
        productId,
        points,
        recentVolume: points.slice(-windowSize).reduce((s, p) => s + p.quantity, 0),
      }))
      .sort((a, b) => b.recentVolume - a.recentVolume)
      .slice(0, 10);

    const products: DistributorForecastProduct[] = [];
    let totalPredictedDemand = 0;
    let restockSoonCount = 0;

    for (const { productId, points } of ranked) {
      const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { nameAr: true } });
      if (!product) continue;

      const lastWindow = points.slice(-windowSize).map((p) => p.quantity);
      const nextWeekDate = new Date(points[points.length - 1].weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const predictedNextWeek = this.forecastModel.predictNextWeek(lastWindow, nextWeekDate);
      totalPredictedDemand += predictedNextWeek;

      const inventory = await this.prisma.inventory.findUnique({
        where: { distributorId_productId: { distributorId, productId } },
      });
      if (inventory && inventory.quantityAvailable < inventory.lowStockThreshold) {
        restockSoonCount++;
      }

      products.push({
        productId,
        nameAr: product.nameAr,
        history: lastWindow,
        predictedNextWeek,
      });
    }

    return { products, totalPredictedDemand, restockSoonCount };
  }
}
