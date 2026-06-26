import { Type } from 'class-transformer';
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
} from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CompanyOrderItemDto {
    @IsUUID()
    productId: string ='';

    @IsNumber()
    @Min( 1 )
    quantity: number=0;

    @IsOptional()
    @IsUUID()
    promotionProductId?: string;
}

export class CreateCompanyOrderDto {
    @IsUUID()
    companyId: string = '';

    @IsArray()
    @ValidateNested( { each: true } )
    @Type( () => CompanyOrderItemDto )
    items: CompanyOrderItemDto[] = [];

    @IsEnum( PaymentMethod )
    paymentMethod: PaymentMethod = PaymentMethod.cod;

    @IsString()
    @IsNotEmpty()
    deliveryAddress: string ='';

    @IsOptional()
    @IsString()
    notes?: string;
}