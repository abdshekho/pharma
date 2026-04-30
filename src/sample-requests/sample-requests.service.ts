import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSampleRequestDto } from './dto/create-sample-request.dto';
import { UpdateSampleRequestStatusDto } from './dto/update-sample-request-status.dto';
import { SampleRequestStatus, UserRole } from '@prisma/client';

@Injectable()
export class SampleRequestsService {
  constructor(private prisma: PrismaService) {}

  private async getDoctorProfile(userId: string) {
    const p = await this.prisma.doctorProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Doctor profile not found');
    return p;
  }

  private async getRepresentativeProfile(userId: string) {
    const p = await this.prisma.representativeProfile.findUnique({ where: { userId }, select: { id: true, cityId: true } });
    if (!p) throw new NotFoundException('Representative profile not found');
    return p;
  }

  private async findRepresentative(companyId: string, cityId: string): Promise<string | null> {
    const rep = await this.prisma.representativeProfile.findFirst({
      where: { companyId, cityId },
      select: { id: true },
    });
    return rep?.id ?? null;
  }

  private async checkQuota(doctorId: string, productId: string, companyId: string) {
    const quota = await this.prisma.sampleQuota.findUnique({
      where: { companyId_productId: { companyId, productId } },
    });
    if (!quota || !quota.isActive) return; // لو ما في quota = مفتوح

    const since = new Date();
    since.setDate(since.getDate() - quota.cooldownDays);

    const recentCount = await this.prisma.sampleRequest.count({
      where: {
        doctorId,
        productId,
        companyId,
        createdAt: { gte: since },
        status: { notIn: [SampleRequestStatus.rejected] },
      },
    });

    if (recentCount >= quota.maxPerDoctor) {
      throw new BadRequestException(
        `لقد تجاوزت الحد المسموح (${quota.maxPerDoctor}) لهذا المنتج. يرجى الانتظار ${quota.cooldownDays} يوماً`,
      );
    }
  }

  async create(userId: string, dto: CreateSampleRequestDto) {
    const doctor = await this.getDoctorProfile(userId);

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { cityId: true } });
    if (!user?.cityId) throw new BadRequestException('User city is not set');

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, companyId: true, status: true, nameAr: true },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.status !== 'active') throw new BadRequestException(`Product ${product.nameAr} is not active`);

    await this.checkQuota(doctor.id, dto.productId, product.companyId);

    const representativeId = await this.findRepresentative(product.companyId, user.cityId);

    return this.prisma.sampleRequest.create({
      data: {
        doctorId: doctor.id,
        productId: dto.productId,
        companyId: product.companyId,
        representativeId,
        quantity: dto.quantity ?? 1,
        deliveryAddress: dto.deliveryAddress,
      },
      include: {
        product: { select: { nameAr: true, imageUrl: true } },
        representative: { select: { user: { select: { fullName: true } } } },
      },
    });
  }

  async findAll(userId: string, role: UserRole) {
    const where: any = {};

    if (role === UserRole.doctor) {
      const doctor = await this.getDoctorProfile(userId);
      where.doctorId = doctor.id;
    } else if (role === UserRole.company) {
      const company = await this.prisma.companyProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!company) throw new NotFoundException('Company profile not found');
      where.companyId = company.id;
    } else if (role === UserRole.representative) {
      const rep = await this.getRepresentativeProfile(userId);
      where.representativeId = rep.id;
    }

    return this.prisma.sampleRequest.findMany({
      where,
      include: {
        product: { select: { nameAr: true, imageUrl: true } },
        doctor: { select: { user: { select: { fullName: true } } } },
        representative: { select: { user: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: UserRole) {
    const req = await this.prisma.sampleRequest.findUnique({
      where: { id },
      include: {
        product: { select: { nameAr: true, imageUrl: true } },
        doctor: { select: { user: { select: { fullName: true } } } },
        company: { select: { companyName: true } },
        representative: { select: { user: { select: { fullName: true } } } },
      },
    });
    if (!req) throw new NotFoundException('Sample request not found');

    if (role === UserRole.doctor) {
      const doctor = await this.getDoctorProfile(userId);
      if (req.doctorId !== doctor.id) throw new ForbiddenException();
    } else if (role === UserRole.representative) {
      const rep = await this.getRepresentativeProfile(userId);
      if (req.representativeId !== rep.id) throw new ForbiddenException();
    } else if (role === UserRole.company) {
      const company = await this.prisma.companyProfile.findUnique({ where: { userId }, select: { id: true } });
      if (req.companyId !== company?.id) throw new ForbiddenException();
    }

    return req;
  }

  async updateStatus(id: string, userId: string, role: UserRole, dto: UpdateSampleRequestStatusDto) {
    const req = await this.prisma.sampleRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Sample request not found');

    this.validateTransition(req.status, dto.status, role);

    if (role === UserRole.company) {
      const company = await this.prisma.companyProfile.findUnique({ where: { userId }, select: { id: true } });
      if (req.companyId !== company?.id) throw new ForbiddenException();
    } else if (role === UserRole.representative) {
      const rep = await this.getRepresentativeProfile(userId);
      if (req.representativeId !== rep.id) throw new ForbiddenException();
    } else if (role === UserRole.doctor) {
      const doctor = await this.getDoctorProfile(userId);
      if (req.doctorId !== doctor.id) throw new ForbiddenException();
    }

    if (dto.status === SampleRequestStatus.rejected && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required');
    }

    return this.prisma.sampleRequest.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.rejectionReason && { rejectionReason: dto.rejectionReason }),
        ...(dto.status === SampleRequestStatus.approved && { approvedAt: new Date() }),
        ...(dto.status === SampleRequestStatus.delivered && { deliveredAt: new Date() }),
      },
    });
  }

  private validateTransition(current: SampleRequestStatus, next: SampleRequestStatus, role: UserRole) {
    const allowed: Partial<Record<UserRole, Partial<Record<SampleRequestStatus, SampleRequestStatus[]>>>> = {
      [UserRole.company]: {
        [SampleRequestStatus.pending]: [SampleRequestStatus.approved, SampleRequestStatus.rejected],
      },
      [UserRole.representative]: {
        [SampleRequestStatus.approved]: [SampleRequestStatus.delivered],
      },
      [UserRole.doctor]: {
        [SampleRequestStatus.pending]: [SampleRequestStatus.rejected], // cancelled
      },
      [UserRole.admin]: {
        [SampleRequestStatus.pending]: [SampleRequestStatus.approved, SampleRequestStatus.rejected],
        [SampleRequestStatus.approved]: [SampleRequestStatus.delivered],
      },
    };

    const allowedNext = allowed[role]?.[current] ?? [];
    if (!allowedNext.includes(next)) {
      throw new BadRequestException(`Cannot transition from ${current} to ${next}`);
    }
  }
}
