import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductAnalyticsService } from './product-analytics.service';
import { ProductAnalyticsController } from './product-analytics.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ProductAnalyticsController],
  providers: [ProductAnalyticsService],
})
export class ProductAnalyticsModule {}
