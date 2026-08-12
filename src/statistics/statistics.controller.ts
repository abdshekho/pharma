import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { StatisticsService } from "./statistics.service";
import { StatisticsQueryDto } from "./dto/statistics-query.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../auth/guards/roles.guard";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { UserRole } from "@prisma/client";
import { ForecastingService } from "../forecasting/forecasting.service";

@Controller("statistics")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatisticsController {
  constructor(
    private readonly service: StatisticsService,
    private readonly forecasting: ForecastingService,
  ) {}

  @Get("pharmacist/reorder-suggestions")
  @Roles(UserRole.pharmacist)
  getPharmacistReorderSuggestions(@CurrentUser() user: any) {
    return this.forecasting.getPharmacistReorderSuggestions(user.id);
  }

  @Get("admin")
  @Roles(UserRole.admin)
  getAdminStats(@Query() query: StatisticsQueryDto) {
    return this.service.getAdminStats(query.startDate, query.endDate);
  }

  @Get("doctor/me")
  @Roles(UserRole.doctor)
  getDoctorStats(@CurrentUser() user: any) {
    return this.service.getDoctorStats(user.id);
  }

  @Get("pharmacist/me")
  @Roles(UserRole.pharmacist)
  getPharmacistStats(@CurrentUser() user: any) {
    return this.service.getPharmacistStats(user.id);
  }

  @Get("company/:companyId")
  @Roles(UserRole.admin, UserRole.company)
  getCompanyStats(
    @Param("companyId") companyId: string,
    @Query() query: StatisticsQueryDto,
  ) {
    return this.service.getCompanyStats(companyId, query.startDate, query.endDate);
  }

  @Get("distributor/:distributorId")
  @Roles(UserRole.admin, UserRole.distributor)
  getDistributorStats(
    @Param("distributorId") distributorId: string,
    @Query() query: StatisticsQueryDto,
  ) {
    return this.service.getDistributorStats(
      distributorId,
      query.startDate,
      query.endDate,
    );
  }

  @Get("distributor/:distributorId/forecast")
  @Roles(UserRole.admin, UserRole.distributor)
  getDistributorForecast(
    @Param("distributorId") distributorId: string,
    @CurrentUser() user: any,
  ) {
    return this.forecasting.getDistributorForecast(distributorId, user.id, user.role);
  }
}
