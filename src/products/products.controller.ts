import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Post()
  @Roles(UserRole.company, UserRole.admin)
  create(@Body() dto: CreateProductDto, @CurrentUser() user: any) {
    return this.service.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
    @Query('dosageForm') dosageForm?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('fields') fields?: string,
  ) {
    return this.service.findAll({ 
      search, 
      companyId, 
      dosageForm, 
      page, 
      limit, 
      fields,
      userRole: user?.role 
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: any, @Query('fields') fields?: string) {
    return this.service.findOne(id, fields, user?.role);
  }

  @Get('barcode/:barcode')
  findByBarcode(@Param('barcode') barcode: string, @CurrentUser() user: any, @Query('fields') fields?: string) {
    return this.service.findByBarcode(barcode, fields, user?.role);
  }

  @Patch(':id')
  @Roles(UserRole.company, UserRole.admin)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: any) {
    return this.service.update(id, user.id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.company, UserRole.admin)
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user.id);
  }
}
