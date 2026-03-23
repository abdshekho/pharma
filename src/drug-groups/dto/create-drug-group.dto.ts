import { IsString, IsOptional, IsBoolean, IsUUID, Length, IsArray } from 'class-validator';

export class CreateDrugGroupDto {
  @IsString()
  @Length(1, 200)
  nameAr!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  categoryIds?: string[];
}
