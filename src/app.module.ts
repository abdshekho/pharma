import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
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
import { DistributorInventoryModule } from './distributor-inventory/distributor-inventory.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
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
    DistributorInventoryModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}