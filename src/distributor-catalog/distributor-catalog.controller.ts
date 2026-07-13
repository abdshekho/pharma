import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DistributorCatalogService } from './distributor-catalog.service';

@Controller('distributor-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.distributor)
export class DistributorCatalogController {
  constructor(private readonly service: DistributorCatalogService) {}

  @Get('pdf')
  async downloadPdf(@CurrentUser() user: any, @Res() res: Response) {
    const pdf = await this.service.generateCatalogPdf(user.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="distributor-inventory-catalog.pdf"',
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  }
}
