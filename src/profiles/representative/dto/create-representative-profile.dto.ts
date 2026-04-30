import { IsUUID } from 'class-validator';

export class CreateRepresentativeProfileDto {
  @IsUUID()
  companyId: string;

  @IsUUID()
  cityId: string;
}
