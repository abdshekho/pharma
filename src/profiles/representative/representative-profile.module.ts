import { Module } from '@nestjs/common';
import { RepresentativeProfileService } from './representative-profile.service';
import { RepresentativeProfileController } from './representative-profile.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RepresentativeProfileController],
  providers: [RepresentativeProfileService],
  exports: [RepresentativeProfileService],
})
export class RepresentativeProfileModule {}
