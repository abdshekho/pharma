import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdatePharmacistProfileDto {
  @IsString()
  @IsOptional()
  pharmacyLicenseNo?: string;

  @IsString()
  @IsOptional()
  pharmacyName?: string;

  @IsString()
  @IsOptional()
  commercialRegNo?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  licenseDocUrl?: string;

  @IsUUID()
  @Transform(({ value }) => value || null)
  areaId: string='';
}
