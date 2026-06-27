import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDistributorDto, CreateRequestCompanyDistributorDto, UpdateCompanyDistributorDto, FindAvailableCompaniesDto } from './dto/company-distributor.dto';
import { UserRole } from '@prisma/client';

@Injectable()
export class CompanyDistributorsService {
  constructor(private prisma: PrismaService) {}

  private async resolveCompanyId(userId: string) {
    const p = await this.prisma.companyProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Company profile not found');
    return p.id;
  }

  async createRequesteFromDistributor(userId: string, dto: CreateRequestCompanyDistributorDto) {
    const company = await this.prisma.companyProfile.findUnique({ where: { id: dto.companyProfileId }, select: { id: true } });
    if (!company) throw new NotFoundException('Company profile not found');
    const companyId = company.id;
    

    // تحقق إن الموزع موجود
    const distributor = await this.prisma.distributorProfile.findUnique({
      where: { userId: userId },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    // تحقق إن المدينة موجودة
    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId }, select: { id: true } });
    if (!city) throw new NotFoundException('City not found');

    const existing = await this.prisma.companyDistributor.findUnique({
      where: { companyId_distributorId_cityId: { companyId, distributorId: dto.distributorProfileId, cityId: dto.cityId } },
    });
    if (existing) throw new ConflictException('Distributor already assigned to this city');

    return this.prisma.companyDistributor.create({
      data: { companyId, distributorId: dto.distributorProfileId, cityId: dto.cityId ,status:'inactive'},
      include: {
        distributor: { select: { companyName: true, user: { select: { fullName: true, email: true } } } },
        city: { select: { nameAr: true } },
      },
    });
  }
  async create(userId: string, dto: CreateCompanyDistributorDto) {
    const companyId = await this.resolveCompanyId(userId);

    // تحقق إن الموزع موجود
    const distributor = await this.prisma.distributorProfile.findUnique({
      where: { id: dto.distributorProfileId },
      select: { id: true },
    });
    if (!distributor) throw new NotFoundException('Distributor not found');

    // تحقق إن المدينة موجودة
    const city = await this.prisma.city.findUnique({ where: { id: dto.cityId }, select: { id: true } });
    if (!city) throw new NotFoundException('City not found');

    const existing = await this.prisma.companyDistributor.findUnique({
      where: { companyId_distributorId_cityId: { companyId, distributorId: dto.distributorProfileId, cityId: dto.cityId } },
    });
    if (existing) throw new ConflictException('Distributor already assigned to this city');

    return this.prisma.companyDistributor.create({
      data: { companyId, distributorId: dto.distributorProfileId, cityId: dto.cityId },
      include: {
        distributor: { select: { companyName: true, user: { select: { fullName: true, email: true } } } },
        city: { select: { nameAr: true } },
      },
    });
  }

  async findInActiveDistributer(userId: string) {
    const companyId = await this.resolveCompanyId(userId);
    return this.prisma.companyDistributor.findMany({
      where: { status: 'inactive',companyId },
      include:{
        distributor: {  select : {user: { select: { fullName: true, email: true } } } },
        city: { select: { nameAr: true } },
      }
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
        distributor: { select: {  user: { select: { fullName: true, email: true } } } },
        city: { select: { nameAr: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async updateStatus(id: string, userId: string, dto: UpdateCompanyDistributorDto) {
    const companyId = await this.resolveCompanyId(userId);

    // Accept either the link's own id or the distributor profile id
    let record = await this.prisma.companyDistributor.findFirst({ where: { id, companyId } });
    if (!record) {
      record = await this.prisma.companyDistributor.findFirst({ where: { distributorId: id, companyId } });
    }
    if (!record) throw new NotFoundException('Record not found');

    return this.prisma.companyDistributor.update({
      where: { id: record.id },
      data: { status: dto.status },
      include: {
        distributor: { select: { user: { select: { fullName: true, email: true } } } },
        city: { select: { nameAr: true } },
      },
    });
  }

  async findMyAcceptedCompanies(userId: string) {
    const profile = await this.prisma.distributorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Distributor profile not found');

    return this.prisma.companyDistributor.findMany({
      where: { distributorId: profile.id, status: 'active' },
      include: {
        company: {
          select: {
            id: true,
            companyName: true,
            logoUrl: true,
            description: true,
            website: true,
            user: { select: { city: { select: { id: true, nameAr: true, nameEn: true } } } },
          },
        },
        city: { select: { id: true, nameAr: true, nameEn: true } },
      },
      orderBy: { assignedAt: 'desc' },
    });
  }

  async findAvailableCompanies(userId: string, filters: FindAvailableCompaniesDto) {
    const profile = await this.prisma.distributorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Distributor profile not found');

    const linked = await this.prisma.companyDistributor.findMany({
      where: { distributorId: profile.id },
      select: { companyId: true },
    });
    const linkedIds = linked.map((r) => r.companyId);

    const where: any = {
      id: { notIn: linkedIds },
      verifiedAt: { not: null },
    };

    if (filters.cityId) {
      where.user = { cityId: filters.cityId };
    }

    if (filters.search) {
      where.companyName = { contains: filters.search, mode: 'insensitive' };
    }

    return this.prisma.companyProfile.findMany({
      where,
      select: {
        id: true,
        companyName: true,
        logoUrl: true,
        description: true,
        website: true,
        user: { select: { city: { select: { id: true, nameAr: true, nameEn: true } } } },
      },
      orderBy: { companyName: 'asc' },
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
