import { IsBoolean, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class CreateSampleQuotaDto {
  @IsUUID()
  productId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerDoctor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateSampleQuotaDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  maxPerDoctor?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  cooldownDays?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
