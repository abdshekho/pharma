import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DistributorCatalogController } from './distributor-catalog.controller';
import { DistributorCatalogService } from './distributor-catalog.service';

@Module({
  imports: [PrismaModule],
  controllers: [DistributorCatalogController],
  providers: [DistributorCatalogService],
})
export class DistributorCatalogModule {}
