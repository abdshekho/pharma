import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { PaymentMethodPos } from '@prisma/client';

export class SaleItemDto {
  @IsUUID()
  productId: string='';

  @IsInt()
  @Min(1)
  quantity: number =0;
}

export class CreateSaleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[]=[];

  @IsEnum(PaymentMethodPos)
  paymentMethod: PaymentMethodPos=PaymentMethodPos.cash;
}
