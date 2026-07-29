import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRepresentativeProfileDto } from './dto/create-representative-profile.dto';
import { CreateRepresentativeStaffDto } from './dto/create-representative-staff.dto';
import { UpdateRepresentativeProfileDto } from './dto/update-representative-profile.dto';
import { UserRole, UserStatus } from '@prisma/client';

const REP_INCLUDE = {
  user: { select: { id: true, email: true, fullName: true, phone: true, status: true, role: true } },
  company: { select: { companyName: true } },
  city: { select: { nameAr: true } },
} as const;

@Injectable()
export class RepresentativeProfileService {
  constructor(private prisma: PrismaService) {}

  private async resolveCompanyProfile(userId: string) {
    const profile = await this.prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Company profile not found');
    return profile;
  }

  async create(userId: string, dto: CreateRepresentativeProfileDto) {
    const existing = await this.prisma.representativeProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Representative profile already exists');

    return this.prisma.representativeProfile.create({
      data: { userId, ...dto ,isActive:false},
      include: {
        company: { select: { companyName: true } },
        city: { select: { nameAr: true } },
      },
    });
  }

  async createManaged(companyUserId: string, dto: CreateRepresentativeStaffDto) {
    const company = await this.resolveCompanyProfile(companyUserId);

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
          role: UserRole.representative,
          fullName: dto.fullName,
          phone: dto.phone ?? null,
          status: UserStatus.active,
        },
      });

      return tx.representativeProfile.create({
        data: {
          userId: user.id,
          companyId: company.id,
          cityId: dto.cityId,
          isActive: false,
        },
        include: REP_INCLUDE,
      });
    });
  }

  async findAll(userId?: string, role?: UserRole, isActive?: string) {
    const where: any = {};



    if (isActive === 'true') where.isActive = true;
    else if (isActive === 'false') where.isActive = false;

      if (role === UserRole.company && userId) {
      const company = await this.prisma.companyProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!company) throw new NotFoundException('Company profile not found');
      where.companyId = company.id;
      return this.prisma.representativeProfile.findMany({
      where,
      include: REP_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    }

    return this.prisma.representativeProfile.findMany({
      where,
      include: REP_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, requesterId?: string, role?: UserRole) {
    const profile = await this.prisma.representativeProfile.findUnique({
      where: { id },
      include: REP_INCLUDE,
    });
    if (!profile) throw new NotFoundException('Representative profile not found');

    if (role === UserRole.company && requesterId) {
      const company = await this.resolveCompanyProfile(requesterId);
      if (profile.companyId !== company.id) throw new ForbiddenException();
    }

    return profile;
  }

  async findByUser(userId: string) {
    const profile = await this.prisma.representativeProfile.findUnique({
      where: { userId },
      include: {
        company: { select: { companyName: true } },
        city: { select: { nameAr: true } },
      },
    });
    if (!profile) throw new NotFoundException('Representative profile not found');
    return profile;
  }

  async verify(id: string, verifierId: string) {
    const profile = await this.prisma.representativeProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Representative profile not found');

    return this.prisma.representativeProfile.update({
      where: { id },
      data: { verifiedAt: new Date(), verifiedBy: verifierId, isActive: true },
      include: REP_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateRepresentativeProfileDto, requesterId: string, role: UserRole) {
    const profile = await this.prisma.representativeProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Representative profile not found');

    if (role === UserRole.company) {
      const company = await this.resolveCompanyProfile(requesterId);
      if (profile.companyId !== company.id) throw new ForbiddenException();
    } else if (role !== UserRole.admin) {
      throw new ForbiddenException();
    }

    if (dto.phone) {
      const phoneInUse = await this.prisma.user.findFirst({
        where: { phone: dto.phone, id: { not: profile.userId } },
      });
      if (phoneInUse) throw new ConflictException('Phone number is already in use');
    }

    const { fullName, phone, cityId, isActive } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (fullName !== undefined || phone !== undefined) {
        await tx.user.update({
          where: { id: profile.userId },
          data: { ...(fullName !== undefined && { fullName }), ...(phone !== undefined && { phone }) },
        });
      }

      return tx.representativeProfile.update({
        where: { id },
        data: {
          ...(cityId !== undefined && { cityId }),
          ...(isActive !== undefined && { isActive }),
        },
        include: REP_INCLUDE,
      });
    });
  }

  async remove(id: string, userId: string, role: UserRole) {
    const profile = await this.prisma.representativeProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Representative profile not found');

    if (role === UserRole.company) {
      const company = await this.resolveCompanyProfile(userId);
      if (profile.companyId !== company.id) throw new ForbiddenException();
    } else if (role !== UserRole.admin && profile.userId !== userId) {
      throw new ForbiddenException();
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.representativeProfile.delete({ where: { id } });
      await tx.user.delete({ where: { id: profile.userId } });
    });
    return { message: 'Representative profile deleted successfully' };
  }
}
