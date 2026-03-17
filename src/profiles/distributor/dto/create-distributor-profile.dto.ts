import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDistributorProfileDto {
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsString()
  @IsOptional()
  licenseDocUrl?: string;
}
