import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CreateCashWithdrawalDto, CreateDisposalDto, CreateReturnDto } from './dto/pos-operations.dto';
import { PosService } from './pos.service';

@Controller('pos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.pharmacist)
export class PosController {
  constructor(private readonly service: PosService) {}

  @Get('search')
  search(@CurrentUser() user: any, @Query('q') q: string) {
    return this.service.searchProducts(user.id, q);
  }

  // إجراء عملية بيع
  @Post('sales')
  createSale(@CurrentUser() user: any, @Body() dto: CreateSaleDto) {
    return this.service.createSale(user.id, dto);
  }

  // المبيعات
  @Get('sales')
  getSales(
    @CurrentUser() user: any, 
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getSales(user.id, startDate, endDate);
  }

  // المرتجعات
  @Post('returns')
  createReturn(@CurrentUser() user: any, @Body() dto: CreateReturnDto) {
    return this.service.createReturn(user.id, dto);
  }

  // الإتلاف
  @Post('disposals')
  createDisposal(@CurrentUser() user: any, @Body() dto: CreateDisposalDto) {
    return this.service.createDisposal(user.id, dto);
  }

  //عمليات السحب
  @Post('cash-withdrawals')
  createWithdrawal(@CurrentUser() user: any, @Body() dto: CreateCashWithdrawalDto) {
    return this.service.createCashWithdrawal(user.id, dto);
  }

  @Get('cash-withdrawals')
  getWithdrawals(
    @CurrentUser() user: any, 
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getWithdrawals(user.id, startDate, endDate);
  }

  @Get('summary')
  getSummary(@CurrentUser() user: any, @Query('date') date?: string) {
    return this.service.getDailySummary(user.id, date);
  }
}
