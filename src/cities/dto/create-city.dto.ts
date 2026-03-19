import { IsString, IsOptional, IsBoolean, Length } from 'class-validator';

export class CreateCityDto {
  @IsString()
  @Length(1, 100)
  nameAr: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  nameEn?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  countryCode?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
