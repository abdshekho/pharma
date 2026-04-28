import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { DistributorInventoryService } from './distributor-inventory.service';
import { AddStockDto } from './dto/add-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('distributor-inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.distributor)
export class DistributorInventoryController {
  constructor(private readonly service: DistributorInventoryService) {}

  @Post('add')
  addStock(@Body() dto: AddStockDto, @CurrentUser() user: any) {
    return this.service.addStock(user.id, dto);
  }

  @Post('adjust')
  adjustStock(@Body() dto: AdjustStockDto, @CurrentUser() user: any) {
    return this.service.adjustStock(user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user.id);
  }

  @Get('movements')
  findMovements(@CurrentUser() user: any, @Query('productId') productId?: string) {
    return this.service.findMovements(user.id, productId);
  }
}
