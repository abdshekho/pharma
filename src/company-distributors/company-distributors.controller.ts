import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { CompanyDistributorsService } from './company-distributors.service';
import { CreateCompanyDistributorDto, UpdateCompanyDistributorDto } from './dto/company-distributor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('company-distributors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyDistributorsController {
  constructor(private readonly service: CompanyDistributorsService) {}

  @Post()
  @Roles(UserRole.company)
  create(@Body() dto: CreateCompanyDistributorDto, @CurrentUser() user: any) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.company, UserRole.distributor, UserRole.admin)
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.id, user.role);
  }

  @Patch(':id/status')
  @Roles(UserRole.company, UserRole.admin)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCompanyDistributorDto, @CurrentUser() user: any) {
    return this.service.updateStatus(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.company, UserRole.admin)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id, user.role);
  }
}
