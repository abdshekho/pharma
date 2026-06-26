import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { CompanyOrdersController } from './company-orders.controller';
import { CompanyOrdersService } from './company-orders.service';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [CompanyOrdersController],
  providers: [CompanyOrdersService],
})
export class CompanyOrdersModule {}