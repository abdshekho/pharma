import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { ReorderRecommendationService } from './reorder.service';
import { ForecastingMapper } from './forecasting.mapper';

/** Thin orchestrator — the only class StatisticsController talks to. */
@Injectable()
export class ForecastingService {
  constructor(
    private prisma: PrismaService,
    private reorderRecommendation: ReorderRecommendationService,
    private mapper: ForecastingMapper,
  ) {}

  async getPharmacistReorderSuggestions(userId: string) {
    const profile = await this.prisma.pharmacistProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Pharmacist profile not found');
    const result = await this.reorderRecommendation.getPharmacistReorderSuggestions(profile.id);
    return this.mapper.toPharmacistReorderResponse(result);
  }

  async getDistributorForecast(distributorId: string, userId: string, role: UserRole) {
    if (role === UserRole.distributor) {
      const own = await this.prisma.distributorProfile.findUnique({ where: { userId }, select: { id: true } });
      if (own?.id !== distributorId) throw new ForbiddenException('Access denied');
    }
    const result = await this.reorderRecommendation.getDistributorForecast(distributorId);
    return this.mapper.toDistributorForecastResponse(result);
  }
}
