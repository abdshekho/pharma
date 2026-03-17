import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { DoctorProfileService } from './doctor-profile.service';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('profiles/doctor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorProfileController {
  constructor(private readonly service: DoctorProfileService) {}

  @Post()
  @Roles(UserRole.doctor)
  create(@CurrentUser() user: any, @Body() dto: CreateDoctorProfileDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.admin)
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @Roles(UserRole.doctor)
  findMine(@CurrentUser() user: any) {
    return this.service.findByUser(user.id);
  }

  @Get(':id')
  @Roles(UserRole.admin)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.doctor, UserRole.admin)
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateDoctorProfileDto) {
    return this.service.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @Roles(UserRole.doctor, UserRole.admin)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id, user.role);
  }
}
