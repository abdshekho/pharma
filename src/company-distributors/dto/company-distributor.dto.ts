import { IsEnum, IsUUID } from 'class-validator';
import { CompanyDistributorStatus } from '@prisma/client';

export class CreateCompanyDistributorDto {
  @IsUUID()
  distributorId: string;

  @IsUUID()
  cityId: string;
}

export class UpdateCompanyDistributorDto {
  @IsEnum(CompanyDistributorStatus)
  status: CompanyDistributorStatus;
}
