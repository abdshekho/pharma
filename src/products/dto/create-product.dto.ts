import { IsString, IsOptional, IsUUID, IsArray, IsEnum, IsInt, IsDecimal, Length, Min } from 'class-validator';
import { DosageForm, PackUnit, PackageType } from '@prisma/client';

export class CreateProductDto {
  @IsString()
  @Length(1, 200)
  nameAr!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  nameEn?: string;

  @IsOptional()
  @IsEnum(DosageForm)
  dosageForm?: DosageForm;

  @IsOptional()
  @IsInt()
  @Min(1)
  packSize?: number;

  @IsOptional()
  @IsEnum(PackUnit)
  packUnit?: PackUnit;

  @IsOptional()
  @IsEnum(PackageType)
  packageType?: PackageType;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  strength?: string;

  @IsOptional()
  @IsString()
  usageInstructions?: string;

  @IsDecimal()
  price!: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsString()
  brochureUrl?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  drugGroupIds?: string[];
}
