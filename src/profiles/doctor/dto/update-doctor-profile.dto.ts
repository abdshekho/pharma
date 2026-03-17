import { IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateDoctorProfileDto {
  @IsString()
  @IsOptional()
  licenseNumber?: string;

  @IsUUID()
  @IsOptional()
  specializationId?: string;

  @IsString()
  @IsOptional()
  hospitalName?: string;

  @IsString()
  @IsOptional()
  licenseDocUrl?: string;
}
