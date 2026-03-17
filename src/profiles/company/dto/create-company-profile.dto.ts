import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCompanyProfileDto {
  @IsString()
  @IsNotEmpty()
  companyName!: string;

  @IsString()
  @IsNotEmpty()
  commercialRegNo!: string;

  @IsString()
  @IsNotEmpty()
  healthMinistryLicense!: string;

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
