import { IsEnum, IsUUID } from 'class-validator';
import { CompanyDistributorStatus } from '@prisma/client';

export class CreateCompanyDistributorDto {
  @IsUUID()
  distributorProfileId: string = '';

  @IsUUID()
  cityId: string = '';
}

export class CreateRequestCompanyDistributorDto {
  @IsUUID()
  distributorProfileId: string = '';
  @IsUUID()
  companyProfileId: string = '';
  @IsUUID()
  cityId: string = '';
}

export class UpdateCompanyDistributorDto {
  @IsEnum(CompanyDistributorStatus)
  status: CompanyDistributorStatus = CompanyDistributorStatus.active;
}
