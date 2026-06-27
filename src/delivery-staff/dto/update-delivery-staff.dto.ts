import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdateDeliveryStaffDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  licensePlate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
