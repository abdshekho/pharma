import { Module } from '@nestjs/common';
import { SampleRequestsService } from './sample-requests.service';
import { SampleRequestsController } from './sample-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SampleRequestsController],
  providers: [SampleRequestsService],
})
export class SampleRequestsModule {}
