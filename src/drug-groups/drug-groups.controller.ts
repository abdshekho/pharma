import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { DrugGroupsService } from './drug-groups.service';
import { AtcImportService } from './atc-import.service';
import { CreateDrugGroupDto } from './dto/create-drug-group.dto';
import { UpdateDrugGroupDto } from './dto/update-drug-group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import * as fs from 'fs';
import * as path from 'path';

@Controller('drug-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DrugGroupsController {
  constructor(
    private readonly service: DrugGroupsService,
    private readonly atcImportService: AtcImportService
  ) {}

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

  @Post('import/atc')
  @Roles(UserRole.admin)
  @UseInterceptors(FileInterceptor('file'))
  async importAtc(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Save uploaded file temporarily
    const tempPath = path.join(__dirname, '../../..', 'temp-atc-import.xlsx');
    fs.writeFileSync(tempPath, file.buffer);

    try {
      const result = await this.atcImportService.importFromExcel(tempPath);
      
      // Clean up temp file
      fs.unlinkSync(tempPath);
      
      return result;
    } catch (error) {
      // Clean up temp file on error
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      throw error;
    }
  }

  @Post('import/atc/local')
  @Roles(UserRole.admin)
  async importAtcLocal() {
    const filePath = path.join(__dirname, '../..', 'test.xlsx');
    // const filePath = path.join(__dirname, '../..', 'ATC_DDD_Index.xlsx');
    return this.atcImportService.importFromExcel(filePath);
  }
}
