import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateRepresentativeProfileDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
