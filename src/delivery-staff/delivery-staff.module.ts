import { Module } from '@nestjs/common';
import { DeliveryStaffController } from './delivery-staff.controller';
import { DeliveryStaffService } from './delivery-staff.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DeliveryStaffController],
  providers: [DeliveryStaffService],
})
export class DeliveryStaffModule {}
