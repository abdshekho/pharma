import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateRepresentativeProfileDto } from './dto/create-representative-profile.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class RepresentativeProfileService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateRepresentativeProfileDto) {
    const existing = await this.prisma.representativeProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Representative profile already exists');

    return this.prisma.representativeProfile.create({
      data: { userId, ...dto },
      include: {
        company: { select: { companyName: true } },
        city: { select: { nameAr: true } },
      },
    });
  }

  async findAll() {
    return this.prisma.representativeProfile.findMany({
      include: {
        user: { select: { id: true, email: true, fullName: true, status: true } },
        company: { select: { companyName: true } },
        city: { select: { nameAr: true } },
      },
    });
  }

  async findOne(id: string) {
    const profile = await this.prisma.representativeProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true, status: true } },
        company: { select: { companyName: true } },
        city: { select: { nameAr: true } },
      },
    });
    if (!profile) throw new NotFoundException('Representative profile not found');
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
      data: { verifiedAt: new Date(), verifiedBy: verifierId },
    });
  }

  async remove(id: string, userId: string, role: UserRole) {
    const profile = await this.prisma.representativeProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Representative profile not found');
    if (role !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException();

    await this.prisma.representativeProfile.delete({ where: { id } });
    return { message: 'Representative profile deleted successfully' };
  }
}
