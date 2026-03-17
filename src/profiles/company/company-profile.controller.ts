import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CompanyProfileService } from './company-profile.service';
import { CreateCompanyProfileDto } from './dto/create-company-profile.dto';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('profiles/company')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyProfileController {
  constructor(private readonly service: CompanyProfileService) {}

  @Post()
  @Roles(UserRole.company)
  create(@CurrentUser() user: any, @Body() dto: CreateCompanyProfileDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.admin)
  findAll() {
    return this.service.findAll();
  }

  @Get('me')
  @Roles(UserRole.company)
  findMine(@CurrentUser() user: any) {
    return this.service.findByUser(user.id);
  }

  @Get(':id')
  @Roles(UserRole.admin)
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Put(':id')
  @Roles(UserRole.company, UserRole.admin)
  update(@Param('id') id: string, @CurrentUser() user: any, @Body() dto: UpdateCompanyProfileDto) {
    return this.service.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @Roles(UserRole.company, UserRole.admin)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id, user.role);
  }
}
