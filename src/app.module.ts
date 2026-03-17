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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}