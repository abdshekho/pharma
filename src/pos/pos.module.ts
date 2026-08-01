import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
