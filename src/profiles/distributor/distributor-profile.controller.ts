import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { DistributorProfileService } from './distributor-profile.service';
import { CreateDistributorProfileDto } from './dto/create-distributor-profile.dto';
import { UpdateDistributorProfileDto } from './dto/update-distributor-profile.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('profiles/distributor')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DistributorProfileController {
  constructor(private readonly service: DistributorProfileService) {}

  @Post()
  @Roles(UserRole.distributor)
  create(@CurrentUser() user: any, @Body() dto: CreateDistributorProfileDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.admin)
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @Roles(UserRole.distributor)
  findMine(@CurrentUser() user: any) {
    return this.service.findByUser(user.id);
  }

  @Get(':id')
  @Roles(UserRole.admin)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.distributor, UserRole.admin)
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateDistributorProfileDto) {
    return this.service.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @Roles(UserRole.distributor, UserRole.admin)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id, user.role);
  }
}
