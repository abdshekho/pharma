import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateDoctorProfileDto {
  @IsString()
  @IsNotEmpty()
  licenseNumber: string;

  @IsUUID()
  @IsOptional()
  specializationId?: string;

  @IsString()
  @IsOptional()
  hospitalName?: string;

  @IsString()
  @IsNotEmpty()
  licenseDocUrl: string;
}
