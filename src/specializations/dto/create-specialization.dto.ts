import { IsString, IsOptional, IsBoolean, IsUUID, Length } from 'class-validator';

export class CreateSpecializationDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsString()
  @Length(1, 100)
  nameAr!: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  nameEn?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
