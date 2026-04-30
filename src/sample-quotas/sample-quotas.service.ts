import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSampleQuotaDto, UpdateSampleQuotaDto } from './dto/sample-quota.dto';

@Injectable()
export class SampleQuotasService {
  constructor(private prisma: PrismaService) {}

  private async resolveCompanyId(userId: string) {
    const p = await this.prisma.companyProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!p) throw new NotFoundException('Company profile not found');
    return p.id;
  }

  async create(userId: string, dto: CreateSampleQuotaDto) {
    const companyId = await this.resolveCompanyId(userId);

    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, companyId },
      select: { id: true, nameAr: true },
    });
    if (!product) throw new NotFoundException('Product not found for this company');

    const existing = await this.prisma.sampleQuota.findUnique({
      where: { companyId_productId: { companyId, productId: dto.productId } },
    });
    if (existing) throw new ConflictException('Quota already exists for this product');

    return this.prisma.sampleQuota.create({
      data: {
        companyId,
        productId: dto.productId,
        maxPerDoctor: dto.maxPerDoctor ?? 1,
        cooldownDays: dto.cooldownDays ?? 30,
        isActive: dto.isActive ?? true,
      },
      include: { product: { select: { nameAr: true, nameEn: true } } },
    });
  }

  async findAll(userId: string) {
    const companyId = await this.resolveCompanyId(userId);

    return this.prisma.sampleQuota.findMany({
      where: { companyId },
      include: { product: { select: { nameAr: true, nameEn: true, imageUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, userId: string, dto: UpdateSampleQuotaDto) {
    const companyId = await this.resolveCompanyId(userId);

    const quota = await this.prisma.sampleQuota.findUnique({ where: { id } });
    if (!quota) throw new NotFoundException('Quota not found');
    if (quota.companyId !== companyId) throw new ForbiddenException();

    return this.prisma.sampleQuota.update({
      where: { id },
      data: dto,
      include: { product: { select: { nameAr: true, nameEn: true } } },
    });
  }

  async remove(id: string, userId: string) {
    const companyId = await this.resolveCompanyId(userId);

    const quota = await this.prisma.sampleQuota.findUnique({ where: { id } });
    if (!quota) throw new NotFoundException('Quota not found');
    if (quota.companyId !== companyId) throw new ForbiddenException();

    await this.prisma.sampleQuota.delete({ where: { id } });
    return { message: 'Quota deleted successfully' };
  }
}
