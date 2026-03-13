import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  role: UserRole;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsOptional()
  @Transform(({ value }) => value || null)
  phone?: string;

  @IsUUID()
  @IsOptional()
  @Transform(({ value }) => value || null)
  cityId?: string;
}