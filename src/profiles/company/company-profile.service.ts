import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyProfileDto } from './dto/create-company-profile.dto';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class CompanyProfileService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateCompanyProfileDto) {
    const existing = await this.prisma.companyProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Company profile already exists');

    return this.prisma.companyProfile.create({ data: { userId, ...dto } });
  }

  async findAll() {
    return this.prisma.companyProfile.findMany({ include: { user: { select: { id: true, email: true, fullName: true, status: true } } } });
  }

  async findOne(id: string) {
    const profile = await this.prisma.companyProfile.findUnique({ where: { id }, include: { user: { select: { id: true, email: true, fullName: true, status: true } } } });
    if (!profile) throw new NotFoundException('Company profile not found');
    return profile;
  }

  async findByUser(userId: string) {
    const profile = await this.prisma.companyProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Company profile not found');
    return profile;
  }

  async update(id: string, userId: string, userRole: UserRole, dto: UpdateCompanyProfileDto) {
    const profile = await this.prisma.companyProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Company profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    return this.prisma.companyProfile.update({ where: { id }, data: dto });
  }

  async remove(id: string, userId: string, userRole: UserRole) {
    const profile = await this.prisma.companyProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Company profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    await this.prisma.companyProfile.delete({ where: { id } });
    return { message: 'Company profile deleted successfully' };
  }
}
