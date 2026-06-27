import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CompanyOrdersService } from './company-orders.service';
import { CreateCompanyOrderDto } from './dto/create-company-order.dto';
import { UpdateCompanyOrderStatusDto } from './dto/update-company-order-status.dto';

@Controller('company-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyOrdersController {
  constructor(private readonly service: CompanyOrdersService) {}

  @Post()
  @Roles(UserRole.distributor)
  create(@Body() dto: CreateCompanyOrderDto, @CurrentUser() user: any) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.company, UserRole.distributor, UserRole.admin)
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.id, user.role);
  }

  @Get(':id')
  @Roles(UserRole.company, UserRole.distributor, UserRole.admin)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user.id, user.role);
  }

  @Patch(':id/status')
  @Roles(UserRole.company, UserRole.distributor, UserRole.admin)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyOrderStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateStatus(id, user.id, user.role, dto);
  }
}