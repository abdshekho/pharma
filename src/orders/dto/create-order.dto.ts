import { Type } from "class-transformer";
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";
import { PaymentMethod } from "@prisma/client";

export class OrderItemDto {
  @IsUUID()
  productId: string = "";

  @IsNumber()
  @Min(1)
  quantity: number = 1;

  @IsOptional()
  @IsUUID()
  promotionProductId?: string;

  @IsOptional()
  @IsUUID()
  promotionBuyXGetYId?: string;
}

export class CreateOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[] = [];

  @IsEnum(PaymentMethod)
  paymentMethod: PaymentMethod = PaymentMethod.cod;

  @IsString()
  @IsNotEmpty()
  deliveryAddress: string = "";

  @IsUUID()
  distributorId?: string = "";

  @IsOptional()
  @IsString()
  notes?: string;
}
