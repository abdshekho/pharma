import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CitiesService } from './cities.service';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { CreateCityAreaDto } from './dto/create-city-area.dto';
import { UpdateCityAreaDto } from './dto/update-city-area.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('cities')
export class CitiesController {
  constructor(private readonly service: CitiesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  create(@Body() dto: CreateCityDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('isActive') isActive?: string) {
    const filter = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.findAll(filter);
  }

  @Post(':cityId/areas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  createArea(@Param('cityId') cityId: string, @Body() dto: CreateCityAreaDto) {
    return this.service.createArea(cityId, dto);
  }

  @Get(':cityId/areas')
  findAreas(@Param('cityId') cityId: string, @Query('isActive') isActive?: string) {
    const filter = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.findAreas(cityId, filter);
  }

  @Get(':cityId/areas/:areaId')
  findArea(@Param('cityId') cityId: string, @Param('areaId') areaId: string) {
    return this.service.findArea(cityId, areaId);
  }

  @Patch(':cityId/areas/:areaId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  updateArea(@Param('cityId') cityId: string, @Param('areaId') areaId: string, @Body() dto: UpdateCityAreaDto) {
    return this.service.updateArea(cityId, areaId, dto);
  }

  @Delete(':cityId/areas/:areaId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  removeArea(@Param('cityId') cityId: string, @Param('areaId') areaId: string) {
    return this.service.removeArea(cityId, areaId);
  }

  //test commit
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  update(@Param('id') id: string, @Body() dto: UpdateCityDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
