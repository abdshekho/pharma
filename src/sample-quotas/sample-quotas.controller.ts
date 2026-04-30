import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SampleQuotasService } from './sample-quotas.service';
import { CreateSampleQuotaDto, UpdateSampleQuotaDto } from './dto/sample-quota.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('sample-quotas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.company)
export class SampleQuotasController {
  constructor(private readonly service: SampleQuotasService) {}

  @Post()
  create(@Body() dto: CreateSampleQuotaDto, @CurrentUser() user: any) {
    return this.service.create(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSampleQuotaDto, @CurrentUser() user: any) {
    return this.service.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id);
  }
}
