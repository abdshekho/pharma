import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SpecializationsService } from './specializations.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('specializations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SpecializationsController {
  constructor(private readonly service: SpecializationsService) {}

  @Post()
  @Roles(UserRole.admin)
  create(@Body() dto: CreateSpecializationDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll(@Query('isActive') isActive?: string,@Query('fields') fields?: string) {
    const filter = isActive === 'true' ? true : isActive === 'false' ? false : undefined;
    return this.service.findAll(filter, fields);
  }

  @Get(':id')
  findOne(@Param('id') id: string,@Query('fields') fields?: string) {
    return this.service.findOne(id, fields);
  }

  @Patch(':id')
  @Roles(UserRole.admin)
  update(@Param('id') id: string, @Body() dto: UpdateSpecializationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.admin)
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
