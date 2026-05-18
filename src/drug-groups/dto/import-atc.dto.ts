import { IsString, IsOptional, IsNumber, IsBoolean } from 'class-validator';

export class ImportAtcDto {
  @IsString()
  atcCodeL1!: string;

  @IsString()
  atcCodeL2!: string;

  @IsString()
  atcCodeL3!: string;

  @IsString()
  nameL3!: string;

  @IsOptional()
  @IsString()
  atcCodeL4?: string;

  @IsOptional()
  @IsString()
  nameL4?: string;

  @IsOptional()
  @IsString()
  atcCodeL5?: string;

  @IsOptional()
  @IsString()
  nameL5?: string;

  @IsOptional()
  @IsNumber()
  dddL5?: number;

  @IsOptional()
  @IsString()
  uL5?: string;

  @IsOptional()
  @IsString()
  admRL5?: string;

  @IsOptional()
  @IsString()
  noteL5?: string;

  @IsOptional()
  @IsString()
  hrefL5?: string;

  @IsOptional()
  @IsBoolean()
  flagDDD?: boolean;
}