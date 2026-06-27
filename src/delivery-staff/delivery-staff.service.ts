import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole, UserStatus } from '@prisma/client';
import { CreateDeliveryStaffDto } from './dto/create-delivery-staff.dto';
import { UpdateDeliveryStaffDto } from './dto/update-delivery-staff.dto';

const STAFF_INCLUDE = {
  user: { select: { id: true, email: true, fullName: true, phone: true, status: true ,role: true} },
} as const;

@Injectable()
export class DeliveryStaffService {
  constructor(private prisma: PrismaService) {}

  private async resolveDistributorProfile(userId: string) {
    const profile = await this.prisma.distributorProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Distributor profile not found');
    return profile;
  }

  async create(distributorUserId: string, dto: CreateDeliveryStaffDto) {
    const distributor = await this.resolveDistributorProfile(distributorUserId);

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email is already in use');

    if (dto.phone) {
      const phoneInUse = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
      if (phoneInUse) throw new ConflictException('Phone number is already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: dto.email,
          passwordHash,
          role: UserRole.delivery_staff,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          status: UserStatus.active,
        },
      });

      const staff = await tx.deliveryStaffProfile.create({
        data: {
          userId: user.id,
          distributorId: distributor.id,
          licensePlate: dto.licensePlate ?? null,
        },
        include: STAFF_INCLUDE,
      });

      return staff;
    });
  }

  async findAll(distributorUserId: string) {
    const distributor = await this.resolveDistributorProfile(distributorUserId);

    return this.prisma.deliveryStaffProfile.findMany({
      where: { distributorId: distributor.id },
      include: STAFF_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(distributorUserId: string, staffId: string) {
    const distributor = await this.resolveDistributorProfile(distributorUserId);

    const staff = await this.prisma.deliveryStaffProfile.findFirst({
      where: { id: staffId, distributorId: distributor.id },
      include: STAFF_INCLUDE,
    });
    if (!staff) throw new NotFoundException('Delivery staff not found');
    return staff;
  }

  async remove(distributorUserId: string, staffId: string) {
    const staff = await this.findOne(distributorUserId, staffId);

    return this.prisma.$transaction(async (tx) => {
      await tx.deliveryStaffProfile.delete({ where: { id: staffId } });
      await tx.user.delete({ where: { id: staff.userId } });
    });
  }

  async update(distributorUserId: string, staffId: string, dto: UpdateDeliveryStaffDto) {
    const staff = await this.findOne(distributorUserId, staffId);

    const { fullName, phone, licensePlate, isActive } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (fullName !== undefined || phone !== undefined) {
        await tx.user.update({
          where: { id: staff.userId },
          data: { ...(fullName !== undefined && { fullName }), ...(phone !== undefined && { phone }) },
        });
      }

      return tx.deliveryStaffProfile.update({
        where: { id: staffId },
        data: {
          ...(licensePlate !== undefined && { licensePlate }),
          ...(isActive !== undefined && { isActive }),
        },
        include: STAFF_INCLUDE,
      });
    });
  }
}
