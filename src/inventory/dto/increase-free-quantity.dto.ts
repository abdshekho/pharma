import { IsInt, IsString, IsUUID, Min } from "class-validator";

export class IncreaseFreeQuantityDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsString()
  note: string ='';
}
