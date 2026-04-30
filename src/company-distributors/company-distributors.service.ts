import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDistributorDto, UpdateCompanyDistributorDto } from './dto/company-distributor.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class CompanyDistributorsService {
  constructor(private prisma: PrismaService) {}

  private async resolveCompanyId(userId: string) {
    const p = await this.prisma.companyProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Company profile not found');
    return p.id;
  }

  async create(userId: string, dto: CreateCompanyDistributorDto) {
    const companyId = await this.resolveCompanyId(userId);

    // تحقق إن الموزع موجود
    const distributor = await this.prisma.distributorProfile.findUnique({
      where: { id: dto.distributorId },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    // تحقق إن المدينة موجودة
    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId }, select: { id: true } });
    if (!city) throw new NotFoundException('City not found');

    const existing = await this.prisma.companyDistributor.findUnique({
      where: { companyId_distributorId_cityId: { companyId, distributorId: dto.distributorId, cityId: dto.cityId } },
    });
    if (existing) throw new ConflictException('Distributor already assigned to this city');

    return this.prisma.companyDistributor.create({
      data: { companyId, distributorId: dto.distributorId, cityId: dto.cityId },
      include: {
        distributor: { select: { companyName: true, user: { select: { fullName: true, email: true } } } },
        city: { select: { nameAr: true } },
      },
    });
  }

  async findAll(userId: string, role: UserRole) {
    const where: any = {};

    if (role === UserRole.company) {
      const companyId = await this.resolveCompanyId(userId);
      where.companyId = companyId;
    } else if (role === UserRole.distributor) {
      const p = await this.prisma.distributorProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!p) throw new NotFoundException('Distributor profile not found');
      where.distributorId = p.id;
    }

    return this.prisma.companyDistributor.findMany({
      where,
      include: {
        company: { select: { companyName: true } },
        distributor: { select: { companyName: true, user: { select: { fullName: true, email: true } } } },
        city: { select: { nameAr: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async updateStatus(id: string, userId: string, dto: UpdateCompanyDistributorDto) {
    const record = await this.prisma.companyDistributor.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Record not found');

    const companyId = await this.resolveCompanyId(userId);
    if (record.companyId !== companyId) throw new ForbiddenException();

    return this.prisma.companyDistributor.update({
      where: { id },
      data: { status: dto.status },
      include: {
        distributor: { select: { companyName: true } },
        city: { select: { nameAr: true } },
      },
    });
  }

  async remove(id: string, userId: string, role: UserRole) {
    const record = await this.prisma.companyDistributor.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Record not found');

    if (role !== UserRole.admin) {
      const companyId = await this.resolveCompanyId(userId);
      if (record.companyId !== companyId) throw new ForbiddenException();
    }

    await this.prisma.companyDistributor.delete({ where: { id } });
    return { message: 'Distributor removed successfully' };
  }
}
