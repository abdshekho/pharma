import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePharmacistProfileDto } from './dto/create-pharmacist-profile.dto';
import { UpdatePharmacistProfileDto } from './dto/update-pharmacist-profile.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class PharmacistProfileService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreatePharmacistProfileDto) {
    const existing = await this.prisma.pharmacistProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Pharmacist profile already exists');

    return this.prisma.pharmacistProfile.create({ data: { userId, ...dto } });
  }

  async findAll() {
    return this.prisma.pharmacistProfile.findMany({ include: { user: { select: { id: true, email: true, fullName: true, status: true } } } });
  }

  async findOne(id: string) {
    const profile = await this.prisma.pharmacistProfile.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, fullName: true, status: true } } } });
    if (!profile) throw new NotFoundException('Pharmacist profile not found');
    return profile;
  }

  async findByUser(userId: string) {
    const profile = await this.prisma.pharmacistProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Pharmacist profile not found');
    return profile;
  }

  async update(id: string, userId: string, userRole: UserRole, dto: UpdatePharmacistProfileDto) {
    const profile = await this.prisma.pharmacistProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Pharmacist profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    return this.prisma.pharmacistProfile.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const profile = await this.prisma.pharmacistProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Pharmacist profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.pharmacistProfile.delete({ where: { id } });
    return { message: 'Pharmacist profile deleted successfully' };
  }
}
