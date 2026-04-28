import { IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class AddStockDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  companyId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}
