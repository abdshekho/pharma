import { IsInt, IsString, IsUUID } from 'class-validator';

export class AdjustStockDto {
  @IsUUID()
  productId: string;

  @IsInt()
  quantity: number; // موجب = زيادة، سالب = نقصان

  @IsString()
  reason: string;
}
