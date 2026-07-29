import { BadRequestException, Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DistributorCatalogService } from './distributor-catalog.service';

@Controller('distributor-catalog')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DistributorCatalogController {
  constructor(private readonly service: DistributorCatalogService) {}

  @Get('pdf')
  @Roles(UserRole.distributor, UserRole.pharmacist)
  async downloadPdf(
    @CurrentUser() user: any,
    @Query('distributorId') distributorId: string | undefined,
    @Res() res: Response,
  ) {
    if (user.role === UserRole.pharmacist && !distributorId) {
      throw new BadRequestException('distributorId is required');
    }

    const pdf = await this.service.generateCatalogPdf(
      user.role === UserRole.distributor ? { userId: user.id } : { distributorId },
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="distributor-inventory-catalog.pdf"',
      'Content-Length': pdf.length,
    });
    res.send(pdf);
  }
}
