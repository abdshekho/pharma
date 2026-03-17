import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDistributorProfileDto } from './dto/create-distributor-profile.dto';
import { UpdateDistributorProfileDto } from './dto/update-distributor-profile.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class DistributorProfileService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateDistributorProfileDto) {
    const existing = await this.prisma.distributorProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Distributor profile already exists');

    return this.prisma.distributorProfile.create({ data: { userId, ...dto } });
  }

  async findAll() {
    return this.prisma.distributorProfile.findMany({ include: { user: { select: { id: true, email: true, fullName: true, status: true } } } });
  }

  async findOne(id: string) {
    const profile = await this.prisma.distributorProfile.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, fullName: true, status: true } } } });
    if (!profile) throw new NotFoundException('Distributor profile not found');
    return profile;
  }

  async findByUser(userId: string) {
    const profile = await this.prisma.distributorProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Distributor profile not found');
    return profile;
  }

  async update(id: string, userId: string, userRole: UserRole, dto: UpdateDistributorProfileDto) {
    const profile = await this.prisma.distributorProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Distributor profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    return this.prisma.distributorProfile.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const profile = await this.prisma.distributorProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Distributor profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.distributorProfile.delete({ where: { id } });
    return { message: 'Distributor profile deleted successfully' };
  }
}
