import { IsOptional, IsUUID } from 'class-validator';

export class FindDistributorsDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;
}
