import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { SampleRequestsService } from './sample-requests.service';
import { CreateSampleRequestDto } from './dto/create-sample-request.dto';
import { UpdateSampleRequestStatusDto } from './dto/update-sample-request-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('sample-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SampleRequestsController {
  constructor(private readonly service: SampleRequestsService) {}

  @Post()
  @Roles(UserRole.doctor)
  create(@Body() dto: CreateSampleRequestDto, @CurrentUser() user: any) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.doctor, UserRole.company, UserRole.representative, UserRole.admin)
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.id, user.role);
  }

  @Get(':id')
  @Roles(UserRole.doctor, UserRole.company, UserRole.representative, UserRole.admin)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user.id, user.role);
  }

  @Patch(':id/status')
  @Roles(UserRole.company, UserRole.representative, UserRole.doctor, UserRole.admin)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateSampleRequestStatusDto, @CurrentUser() user: any) {
    return this.service.updateStatus(id, user.id, user.role, dto);
  }
}
