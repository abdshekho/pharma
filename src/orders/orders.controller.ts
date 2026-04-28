import { Controller, Get, Post, Patch, Body, Param, UseGuards } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Post()
  @Roles(UserRole.pharmacist)
  create(@Body() dto: CreateOrderDto, @CurrentUser() user: any) {
    return this.service.create(user.id, dto);
  }

  @Get()
  @Roles(UserRole.pharmacist, UserRole.distributor, UserRole.admin)
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.id, user.role);
  }

  @Get(':id')
  @Roles(UserRole.pharmacist, UserRole.distributor, UserRole.admin)
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user.id, user.role);
  }

  @Patch(':id/status')
  @Roles(UserRole.distributor, UserRole.pharmacist, UserRole.admin)
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto, @CurrentUser() user: any) {
    return this.service.updateStatus(id, user.id, user.role, dto);
  }
}
