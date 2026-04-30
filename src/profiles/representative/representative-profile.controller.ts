import { Controller, Get, Post, Delete, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { RepresentativeProfileService } from './representative-profile.service';
import { CreateRepresentativeProfileDto } from './dto/create-representative-profile.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('profiles/representative')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RepresentativeProfileController {
  constructor(private readonly service: RepresentativeProfileService) {}

  @Post()
  @Roles(UserRole.representative)
  create(@CurrentUser() user: any, @Body() dto: CreateRepresentativeProfileDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.admin)
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @Roles(UserRole.representative)
  findMine(@CurrentUser() user: any) {
    return this.service.findByUser(user.id);
  }

  @Get(':id')
  @Roles(UserRole.admin, UserRole.company)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/verify')
  @Roles(UserRole.admin)
  verify(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.verify(id, user.id);
  }

  @Delete(':id')
  @Roles(UserRole.representative, UserRole.admin)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id, user.role);
  }
}
