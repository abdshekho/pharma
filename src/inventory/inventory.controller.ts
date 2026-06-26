import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AddInventoryStockDto } from './dto/add-inventory-stock.dto';
import { AdjustInventoryStockDto } from './dto/adjust-inventory-stock.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.company, UserRole.distributor, UserRole.pharmacist)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Post('add')
  addStock(@Body() dto: AddInventoryStockDto, @CurrentUser() user: any) {
    return this.service.addStockForUser(user.id, user.role, dto);
  }

  @Post('adjust')
  adjustStock(@Body() dto: AdjustInventoryStockDto, @CurrentUser() user: any) {
    return this.service.adjustStockForUser(user.id, user.role, dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAllForUser(user.id, user.role);
  }

  @Get('movements')
  findMovements(@CurrentUser() user: any, @Query('productId') productId?: string) {
    return this.service.findMovementsForUser(user.id, user.role, productId);
  }
}
