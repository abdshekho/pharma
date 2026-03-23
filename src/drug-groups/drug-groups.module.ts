import { Module } from '@nestjs/common';
import { DrugGroupsService } from './drug-groups.service';
import { DrugGroupsController } from './drug-groups.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [DrugGroupsController],
  providers: [DrugGroupsService],
})
export class DrugGroupsModule {}
