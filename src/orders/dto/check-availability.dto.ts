import { Type } from 'class-transformer';
import { IsArray, IsNotEmpty, IsString, IsNumber, Min, ValidateNested } from 'class-validator';

export class CheckAvailabilityItemDto {
  @IsString()
  @IsNotEmpty()
  productId: string ='';

  @IsNumber()
  @Min(1)
  quantity: number=1;
}

export class CheckAvailabilityDto {
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  distributorIds: string[]=[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckAvailabilityItemDto)
  items: CheckAvailabilityItemDto[]=[];
}