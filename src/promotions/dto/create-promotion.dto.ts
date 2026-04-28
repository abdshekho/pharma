import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PromotionTargetType, PromotionType, PromotionLevel } from '@prisma/client';

export class PromotionProductDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(0)
  discountPercent: number;
}

export class BuyXGetYDto {
  @IsUUID()
  buyProductId: string;

  @IsInt()
  @Min(1)
  buyQuantity: number;

  @IsUUID()
  freeProductId: string;

  @IsInt()
  @Min(1)
  freeQuantity: number;
}

export class CreatePromotionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(PromotionType)
  type: PromotionType;

  @IsEnum(PromotionLevel)
  level: PromotionLevel;

  @IsEnum(PromotionTargetType)
  @IsOptional()
  targetType?: PromotionTargetType;

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // للموزع — ربط بعرض الشركة الأصلي (اختياري)
  @IsOptional()
  @IsUUID()
  parentPromotionId?: string;

  // مطلوب لو type = percentage
  @ValidateIf((o) => o.type === PromotionType.percentage)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PromotionProductDto)
  products?: PromotionProductDto[];

  // مطلوب لو type = buyXgetY
  @ValidateIf((o) => o.type === PromotionType.buyXgetY)
  @ValidateNested()
  @Type(() => BuyXGetYDto)
  buyXgetY?: BuyXGetYDto;
}
