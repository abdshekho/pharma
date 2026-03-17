import { Module } from '@nestjs/common';
import { PharmacistProfileService } from './pharmacist-profile.service';
import { PharmacistProfileController } from './pharmacist-profile.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PharmacistProfileController],
  providers: [PharmacistProfileService],
})
export class PharmacistProfileModule {}
