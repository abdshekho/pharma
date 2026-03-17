import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PharmacistProfileService } from './pharmacist-profile.service';
import { CreatePharmacistProfileDto } from './dto/create-pharmacist-profile.dto';
import { UpdatePharmacistProfileDto } from './dto/update-pharmacist-profile.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('profiles/pharmacist')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PharmacistProfileController {
  constructor(private readonly service: PharmacistProfileService) {}

  @Post()
  @Roles(UserRole.pharmacist)
  create(@CurrentUser() user: any, @Body() dto: CreatePharmacistProfileDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.admin)
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @Roles(UserRole.pharmacist)
  findMine(@CurrentUser() user: any) {
    return this.service.findByUser(user.id);
  }

  @Get(':id')
  @Roles(UserRole.admin)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.pharmacist, UserRole.admin)
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdatePharmacistProfileDto) {
    return this.service.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @Roles(UserRole.pharmacist, UserRole.admin)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id, user.role);
  }
}
