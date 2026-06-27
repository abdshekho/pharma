import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AddInventoryStockDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
