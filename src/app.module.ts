import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { EmailModule } from './email/email.module';
import { CompanyProfileModule } from './profiles/company/company-profile.module';
import { DoctorProfileModule } from './profiles/doctor/doctor-profile.module';
import { PharmacistProfileModule } from './profiles/pharmacist/pharmacist-profile.module';
import { DistributorProfileModule } from './profiles/distributor/distributor-profile.module';
import { CitiesModule } from './cities/cities.module';
import { CategoriesModule } from './categories/categories.module';

import { SpecializationsModule } from './specializations/specializations.module';
import { DrugGroupsModule } from './drug-groups/drug-groups.module';
import { ProductsModule } from './products/products.module';
import { OrdersModule } from './orders/orders.module';
import { PromotionsModule } from './promotions/promotions.module';
// import { DistributorInventoryModule } from './distributor-inventory/distributor-inventory.module';
import { RepresentativeProfileModule } from './profiles/representative/representative-profile.module';
import { SampleRequestsModule } from './sample-requests/sample-requests.module';
import { CompanyDistributorsModule } from './company-distributors/company-distributors.module';
import { SampleQuotasModule } from './sample-quotas/sample-quotas.module';
import { DeliveryStaffModule } from './delivery-staff/delivery-staff.module';
import { InventoryModule } from './inventory/inventory.module';
import { CompanyOrdersModule } from './company-orders/company-orders.module';
import { StatisticsModule } from './statistics/statistics.module';
import { DistributorCatalogModule } from './distributor-catalog/distributor-catalog.module';
import { PosModule } from './pos/pos.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ProductAnalyticsModule } from './product-analytics/product-analytics.module';
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    EmailModule,
    AuthModule,
    UsersModule,
    CompanyProfileModule,
    DoctorProfileModule,
    PharmacistProfileModule,
    DistributorProfileModule,
    CitiesModule,
    CategoriesModule,
    SpecializationsModule,
    DrugGroupsModule,
    ProductsModule,
    OrdersModule,
    PromotionsModule,
    // DistributorInventoryModule,
    RepresentativeProfileModule,
    SampleRequestsModule,
    CompanyDistributorsModule,
    SampleQuotasModule,
    DeliveryStaffModule,
    InventoryModule,
    CompanyOrdersModule,
    StatisticsModule,
    DistributorCatalogModule,
    PosModule,
    NotificationsModule,
    ProductAnalyticsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}