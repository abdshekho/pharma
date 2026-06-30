import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { newOrderServices } from './newOrder.service';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [OrdersController],
  providers: [OrdersService ,newOrderServices],
})
export class OrdersModule {}
