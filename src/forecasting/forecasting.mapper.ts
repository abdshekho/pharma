import { Injectable } from '@nestjs/common';
import { ReorderSuggestionResult, DistributorForecastResult } from './reorder.service';

@Injectable()
export class ForecastingMapper {
  toPharmacistReorderResponse(suggestions: ReorderSuggestionResult[]) {
    return {
      generatedAt: new Date().toISOString(),
      suggestions: suggestions.map((s) =>
        s.forecastAvailable
          ? {
              ...s,
              predictedWeeklyDemand: Math.round(s.predictedWeeklyDemand),
              suggestedReorderQty: Math.round(s.suggestedReorderQty),
            }
          : s,
      ),
    };
  }

  toDistributorForecastResponse(result: DistributorForecastResult) {
    return {
      generatedAt: new Date().toISOString(),
      totalPredictedDemand: Math.round(result.totalPredictedDemand),
      restockSoonCount: result.restockSoonCount,
      products: result.products.map((p) => ({ ...p, predictedNextWeek: Math.round(p.predictedNextWeek) })),
    };
  }
}
