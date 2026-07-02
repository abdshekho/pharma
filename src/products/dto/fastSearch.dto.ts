import { IsNotEmpty, IsOptional, IsString} from 'class-validator';

export class fastSearchDistributorProductsDto {
  @IsString()
  // @IsNotEmpty()
  areaId?: string='';

  @IsString()
  @IsNotEmpty()
  distributorIds: string='';


  @IsOptional()
  @IsString()
  search?: string;

}
