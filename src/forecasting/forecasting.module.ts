import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ForecastingService } from './forecasting.service';
import { ForecastModelService } from './forecast-model.service';
import { DemandHistoryService } from './demand-history.service';
import { ReorderRecommendationService } from './reorder.service';
import { ForecastingMapper } from './forecasting.mapper';

@Module({
  imports: [PrismaModule],
  providers: [
    ForecastingService,
    ForecastModelService,
    DemandHistoryService,
    ReorderRecommendationService,
    ForecastingMapper,
  ],
  exports: [ForecastingService],
})
export class ForecastingModule {}
