import { Module } from '@nestjs/common';
import { CompanyDistributorsService } from './company-distributors.service';
import { CompanyDistributorsController } from './company-distributors.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CompanyDistributorsController],
  providers: [CompanyDistributorsService],
})
export class CompanyDistributorsModule {}
