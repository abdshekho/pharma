import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateDeliveryStaffDto {
  @IsEmail()
  email: string = '';

  @IsString()
  @MinLength(6)
  password: string = '';

  @IsString()
  @IsNotEmpty()
  fullName: string = '';

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  licensePlate?: string;
}
