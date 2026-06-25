import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class CreateCityAreaDto {
  @IsString()
  @Length(1, 100)
  nameAr: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  nameEn?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
