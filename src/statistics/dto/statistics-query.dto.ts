import { IsOptional, IsDateString } from 'class-validator';

export class StatisticsQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
