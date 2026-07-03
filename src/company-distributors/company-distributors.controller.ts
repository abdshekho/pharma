import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CompanyDistributorsService } from './company-distributors.service';
import { CreateCompanyDistributorDto, CreateRequestCompanyDistributorDto, UpdateCompanyDistributorDto, FindAvailableCompaniesDto } from './dto/company-distributor.dto';
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

  @Post('request')
  @Roles(UserRole.distributor)
  createFromDistributor(@Body() dto: CreateRequestCompanyDistributorDto, @CurrentUser() user: any) {
    return this.service.createRequesteFromDistributor(user.id, dto);
  }

  @Get()
  @Roles(UserRole.company, UserRole.distributor, UserRole.admin)
  findAll(@CurrentUser() user: any, @Query('status') status?: string) {
    return this.service.findAll(user.id, user.role, status);
  }
  @Get('inactive')
  @Roles(UserRole.company)
  findInActiveDistributer(@CurrentUser() user: any) {
    return this.service.findInActiveDistributer(user.id);
  }

  @Get('my-companies')
  @Roles(UserRole.distributor)
  findMyAcceptedCompanies(@CurrentUser() user: any) {
    return this.service.findMyAcceptedCompanies(user.id);
  }

  @Get('available-companies')
  @Roles(UserRole.distributor)
  findAvailableCompanies(@CurrentUser() user: any, @Query() query: FindAvailableCompaniesDto) {
    return this.service.findAvailableCompanies(user.id, query);
  }

  @Patch(':id/status')
  @Roles(UserRole.company)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCompanyDistributorDto, @CurrentUser() user: any) {
    return this.service.updateStatus(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.company, UserRole.admin)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id, user.role);
  }
}
