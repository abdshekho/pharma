import { Module } from '@nestjs/common';
import { SampleRequestsService } from './sample-requests.service';
import { SampleRequestsController } from './sample-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, NotificationsModule],
  controllers: [SampleRequestsController],
  providers: [SampleRequestsService],
})
export class SampleRequestsModule {}
