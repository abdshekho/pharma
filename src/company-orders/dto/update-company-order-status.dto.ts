import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class UpdateCompanyOrderStatusDto {
    @IsEnum(OrderStatus)
    status: OrderStatus = 'pending';

    @IsOptional()
    @IsString()
    rejectionReason?: string;

    // @IsOptional()
    // @IsUUID()
    // deliveryStaffId?: string;
}