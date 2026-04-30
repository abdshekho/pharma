import { Module } from '@nestjs/common';
import { SampleQuotasService } from './sample-quotas.service';
import { SampleQuotasController } from './sample-quotas.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SampleQuotasController],
  providers: [SampleQuotasService],
})
export class SampleQuotasModule {}
