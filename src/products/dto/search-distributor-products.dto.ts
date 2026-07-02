import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchDistributorProductsDto {
  @IsString()
  @IsNotEmpty()
  distributorIds: string='';

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  drugGroupIds?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
