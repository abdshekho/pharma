import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { InventoryReferenceType } from '@prisma/client';

export class InventoryMovementsQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsEnum(InventoryReferenceType)
  referenceType?: InventoryReferenceType;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
