import { IsOptional, IsString } from 'class-validator';

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
}
