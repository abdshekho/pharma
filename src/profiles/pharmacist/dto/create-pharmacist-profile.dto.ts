import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';


export class CreatePharmacistProfileDto {
  @IsString()
  @IsNotEmpty()
  pharmacyLicenseNo: string='';

  @IsString()
  @IsNotEmpty()
  pharmacyName: string='';

  @IsString()
  @IsOptional()
  commercialRegNo?: string;

  @IsString()
  @IsNotEmpty()
  address: string='';

  @IsString()
  @IsOptional()
  licenseDocUrl?: string;

  @IsUUID()
  @Transform(({ value }) => value || null)
  areaId: string='';
}
