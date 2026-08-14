import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ProductAnalyticsQueryDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  months?: number;
}

export class ProductSalesQueryDto extends ProductAnalyticsQueryDto {
  @IsOptional()
  @IsIn(['month', 'quarter', 'year'])
  compareWith?: 'month' | 'quarter' | 'year';
}
