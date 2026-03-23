import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { DrugGroupsService } from './drug-groups.service';
import { CreateDrugGroupDto } from './dto/create-drug-group.dto';
import { UpdateDrugGroupDto } from './dto/update-drug-group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('drug-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DrugGroupsController {
  constructor(private readonly service: DrugGroupsService) {}

  @Post()
  @Roles(UserRole.admin)
  create(@Body() dto: CreateDrugGroupDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('fields') fields?: string) {
    return this.service.findAll(fields);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('fields') fields?: string) {
    return this.service.findOne(id, fields);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(@Param('id') id: string, @Body() dto: UpdateDrugGroupDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
