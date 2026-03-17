import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePharmacistProfileDto {
  @IsString()
  @IsNotEmpty()
  pharmacyLicenseNo: string;

  @IsString()
  @IsNotEmpty()
  pharmacyName: string;

  @IsString()
  @IsOptional()
  commercialRegNo?: string;

  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsOptional()
  licenseDocUrl?: string;
}
