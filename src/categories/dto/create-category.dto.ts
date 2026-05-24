import { IsString, IsOptional, IsBoolean, IsUUID, Length, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  code?: string;

  @IsString()
  @Length(1, 100)
  nameAr!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  nameEn?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
