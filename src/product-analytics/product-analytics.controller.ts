import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProductAnalyticsService } from './product-analytics.service';
import {
  ProductAnalyticsQueryDto,
  ProductSalesQueryDto,
} from './dto/product-analytics-query.dto';

@Controller('products/:productId')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductAnalyticsController {
  constructor(private readonly service: ProductAnalyticsService) {}

  @Get('sales/basic')
  @Roles(UserRole.company, UserRole.admin)
  getSalesBasic(
    @Param('productId') productId: string,
    @Query() query: ProductSalesQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.service.getSalesBasic(productId, query, user);
  }

  @Get('customers')
  @Roles(UserRole.company, UserRole.admin)
  getCustomers(
    @Param('productId') productId: string,
    @Query() query: ProductAnalyticsQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.service.getCustomers(productId, query, user);
  }

  @Get('geographic')
  @Roles(UserRole.company, UserRole.admin)
  getGeographic(
    @Param('productId') productId: string,
    @Query() query: ProductAnalyticsQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.service.getGeographic(productId, query, user);
  }

  @Get('growth')
  @Roles(UserRole.company, UserRole.admin)
  getGrowth(
    @Param('productId') productId: string,
    @Query() query: ProductAnalyticsQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.service.getGrowth(productId, query, user);
  }

  @Get('inventory')
  @Roles(UserRole.company, UserRole.admin)
  getInventory(
    @Param('productId') productId: string,
    @Query() query: ProductAnalyticsQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.service.getInventory(productId, query, user);
  }

  @Get('promotions')
  @Roles(UserRole.company, UserRole.admin)
  getPromotions(
    @Param('productId') productId: string,
    @Query() query: ProductAnalyticsQueryDto,
    @CurrentUser() user: any,
  ) {
    return this.service.getPromotions(productId, query, user);
  }
}
