import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class DoctorProfileService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateDoctorProfileDto) {
    const existing = await this.prisma.doctorProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Doctor profile already exists');

    return this.prisma.doctorProfile.create({ data: { userId, ...dto } });
  }

  async findAll() {
    return this.prisma.doctorProfile.findMany({ include: { user: { select: { id: true, email: true, fullName: true, status: true } }, specialization: true } });
  }

  async findOne(id: string) {
    const profile = await this.prisma.doctorProfile.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, fullName: true, status: true } }, specialization: true } });
    if (!profile) throw new NotFoundException('Doctor profile not found');
    return profile;
  }

  async findByUser(userId: string) {
    const profile = await this.prisma.doctorProfile.findUnique({ where: { userId }, include: { specialization: true } });
    if (!profile) throw new NotFoundException('Doctor profile not found');
    return profile;
  }

  async update(id: string, userId: string, userRole: UserRole, dto: UpdateDoctorProfileDto) {
    const profile = await this.prisma.doctorProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Doctor profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    return this.prisma.doctorProfile.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const profile = await this.prisma.doctorProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Doctor profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.doctorProfile.delete({ where: { id } });
    return { message: 'Doctor profile deleted successfully' };
  }
}
