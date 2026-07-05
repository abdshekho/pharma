import { Module } from '@nestjs/common';
import { StatisticsService } from './statistics.service';
import { StatisticsController } from './statistics.controller';

@Module({
  imports: [],
  controllers: [StatisticsController],
  providers: [StatisticsService],
})
export class StatisticsModule {}
