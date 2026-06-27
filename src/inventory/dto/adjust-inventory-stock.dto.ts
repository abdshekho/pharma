import { IsInt, IsOptional, IsString, IsUUID } from 'class-validator';

export class AdjustInventoryStockDto {
  @IsUUID()
  productId: string;

  @IsInt()
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;
}
