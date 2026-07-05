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
import { UserRole } from "@prisma/client";

@Controller("statistics")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StatisticsController {
  constructor(private readonly service: StatisticsService) {}

  @Get("admin")
  @Roles(UserRole.admin)
  getAdminStats(@Query() query: StatisticsQueryDto) {
    return this.service.getAdminStats(query.startDate, query.endDate);
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
}
