import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PromotionsService } from './promotions.service';
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('promotions')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PromotionsController {
  constructor(private readonly service: PromotionsService) {}

  @Post()
  @Roles(UserRole.company, UserRole.distributor)
  create(@Body() dto: CreatePromotionDto, @CurrentUser() user: any) {
    return this.service.create(user.id, user.role, dto);
  }

  @Get()
  findAll(
    @Query('companyId') companyId?: string,
    @Query('distributorId') distributorId?: string,
    @Query('level') level?: string,
    @Query('type') type?: string,
  ) {
    return this.service.findAll({ companyId, distributorId, level, type });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id/toggle-active')
  @Roles(UserRole.company, UserRole.distributor, UserRole.admin)
  toggleActive(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.toggleActive(id, user.id, user.role);
  }
}
