import { Module } from '@nestjs/common';
import { DistributorProfileService } from './distributor-profile.service';
import { DistributorProfileController } from './distributor-profile.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DistributorProfileController],
  providers: [DistributorProfileService],
})
export class DistributorProfileModule {}
