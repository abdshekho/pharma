import { IsOptional, IsString } from 'class-validator';

export class FindDistributorsDto {
  @IsOptional()
  @IsString()
  companyIds?: string;
}
