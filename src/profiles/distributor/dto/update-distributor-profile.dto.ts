import { IsOptional, IsString } from 'class-validator';

export class UpdateDistributorProfileDto {
  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  licenseDocUrl?: string;
}
