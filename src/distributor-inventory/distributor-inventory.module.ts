import { Module } from '@nestjs/common';
import { DistributorInventoryService } from './distributor-inventory.service';
import { DistributorInventoryController } from './distributor-inventory.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DistributorInventoryController],
  providers: [DistributorInventoryService],
  exports: [DistributorInventoryService],
})
export class DistributorInventoryModule {}
