import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AddInventoryStockDto } from './dto/add-inventory-stock.dto';
import { AdjustInventoryStockDto } from './dto/adjust-inventory-stock.dto';
import { IncreaseFreeQuantityDto } from './dto/increase-free-quantity.dto';
import { InventoryMovementsQueryDto } from './dto/inventory-movements-query.dto';
import { LowStockQueryDto } from './dto/low-stock-query.dto';
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

  @Post('free-quantity/increase')
  @Roles(UserRole.company)
  increaseFreeQuantity(@Body() dto: IncreaseFreeQuantityDto, @CurrentUser() user: any) {
    return this.service.increaseFreeQuantity(user.id, user.role, dto);
  }

  @Post('free-quantity/decrease')
  @Roles(UserRole.company)
  decreaseFreeQuantity(@Body() dto: IncreaseFreeQuantityDto, @CurrentUser() user: any) {
    return this.service.decreaseFreeQuantity(user.id, user.role, dto);
  }

  @Get()
  // @Roles(UserRole.company, UserRole.distributor, UserRole.pharmacist)
  findAll(@CurrentUser() user: any) {
    return this.service.findAllForUser(user.id, user.role);
  }

  @Get('movements')
  findMovements(
    @CurrentUser() user: any, 
    @Query() query: InventoryMovementsQueryDto,
  ) {
    return this.service.findMovementsForUser(
      user.id, 
      user.role, 
      query.productId, 
      query.referenceType, 
      query.startDate, 
      query.endDate
    );
  }

  @Get('low-stock')
  @Roles(UserRole.pharmacist)
  findLowStock(
    @CurrentUser() user: any,
    @Query() query: LowStockQueryDto
  ) {
    return this.service.findLowStockForPharmacist(user.id, query.excludeOrdered);
  }
}
