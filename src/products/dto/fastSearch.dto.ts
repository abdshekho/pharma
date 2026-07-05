import { IsOptional, IsString} from 'class-validator';

export class fastSearchDistributorProductsDto {
  @IsOptional()
  @IsString()
  distributorIds?: string;

  @IsOptional()
  @IsString()
  search?: string;

}
