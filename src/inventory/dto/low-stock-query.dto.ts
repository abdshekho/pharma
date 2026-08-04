import { IsOptional, IsBooleanString } from 'class-validator';

export class LowStockQueryDto {

  @IsOptional()
  @IsBooleanString()
  excludeOrdered?: string = 'true';
}