import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateRepresentativeStaffDto {
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

  @IsUUID()
  cityId: string = '';
}
