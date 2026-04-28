import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { DistributorInventoryModule } from '../distributor-inventory/distributor-inventory.module';

@Module({
  imports: [PrismaModule, DistributorInventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
