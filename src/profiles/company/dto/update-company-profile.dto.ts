import { IsOptional, IsString } from 'class-validator';

export class UpdateCompanyProfileDto {
  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  commercialRegNo?: string;

  @IsString()
  @IsOptional()
  healthMinistryLicense?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsString()
  @IsOptional()
  website?: string;

  @IsString()
  @IsOptional()
  description?: string;
}
