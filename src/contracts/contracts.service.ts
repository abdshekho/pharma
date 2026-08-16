import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { ContractStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TerminateContractDto } from './dto/terminate-contract.dto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalize((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function hashTerms(termsSnapshot: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(termsSnapshot)))
    .digest('hex');
}

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  private buildTermsSnapshot(params: {
    companyName: string;
    distributorName: string;
    cityName: string;
    effectiveDate: Date;
  }) {
    return {
      companyName: params.companyName,
      distributorName: params.distributorName,
      cityName: params.cityName,
      effectiveDate: params.effectiveDate.toISOString(),
      clauses: [
        `The distributor is authorized to purchase products from ${params.companyName} and resell them to pharmacists within ${params.cityName}.`,
        `The distributor must not sell any product to pharmacists above the distributor-to-pharmacist price set by ${params.companyName} for that product at the time of sale.`,
        `This distribution right for ${params.cityName} is exclusive to the distributor for the duration this contract remains active.`,
        `${params.companyName} may terminate this contract at any time; termination revokes the distributor's ability to place new orders with ${params.companyName}.`,
        'This is an electronic record. Signing it below constitutes explicit acceptance of these terms by the distributor.',
      ],
    };
  }

  async generateForApproval(companyDistributorId: string) {
    const existing = await this.prisma.distributorContract.findUnique({
      where: { companyDistributorId },
    });
    if (
      existing &&
      existing.status !== ContractStatus.terminated
    ) {
      return existing;
    }

    const link = await this.prisma.companyDistributor.findUnique({
      where: { id: companyDistributorId },
      include: {
        company: { select: { companyName: true } },
        distributor: { select: { companyName: true } },
        city: { select: { nameAr: true } },
      },
    });
    if (!link) throw new NotFoundException('Company-distributor link not found');

    const termsSnapshot = this.buildTermsSnapshot({
      companyName: link.company.companyName,
      distributorName: link.distributor.companyName,
      cityName: link.city.nameAr,
      effectiveDate: new Date(),
    });

    const data = {
      companyId: link.companyId,
      distributorId: link.distributorId,
      version: (existing?.version ?? 0) + 1,
      termsSnapshot,
      termsHash: hashTerms(termsSnapshot),
      status: ContractStatus.pending_signature,
    };

    if (existing) {
      return this.prisma.distributorContract.update({
        where: { companyDistributorId },
        data,
      });
    }

    return this.prisma.distributorContract.create({
      data: { companyDistributorId, ...data },
    });
  }

  private async assertAccess(
    companyId: string,
    distributorId: string,
    userId: string,
    role: UserRole,
  ) {
    if (role === UserRole.company) {
      const profile = await this.prisma.companyProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (companyId !== profile?.id) throw new ForbiddenException();
    } else if (role === UserRole.distributor) {
      const profile = await this.prisma.distributorProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (distributorId !== profile?.id) throw new ForbiddenException();
    }
  }

  async findAll(userId: string, role: UserRole) {
    const where: any = {};

    if (role === UserRole.company) {
      const profile = await this.prisma.companyProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!profile) throw new NotFoundException('Company profile not found');
      where.companyId = profile.id;
    } else if (role === UserRole.distributor) {
      const profile = await this.prisma.distributorProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!profile) throw new NotFoundException('Distributor profile not found');
      where.distributorId = profile.id;
    }

    return this.prisma.distributorContract.findMany({
      where,
      include: {
        company: { select: { companyName: true } },
        distributor: { select: { companyName: true } },
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  async findOne(id: string, userId: string, role: UserRole) {
    const contract = await this.prisma.distributorContract.findUnique({
      where: { id },
      include: {
        company: { select: { companyName: true } },
        distributor: { select: { companyName: true } },
      },
    });
    if (!contract) throw new NotFoundException('Contract not found');

    await this.assertAccess(contract.companyId, contract.distributorId, userId, role);
    return contract;
  }

  async sign(
    id: string,
    userId: string,
    role: UserRole,
    ip: string | undefined,
    userAgent: string | undefined,
  ) {
    if (role !== UserRole.distributor) {
      throw new ForbiddenException('Only the distributor can sign this contract');
    }

    const contract = await this.prisma.distributorContract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('Contract not found');

    await this.assertAccess(contract.companyId, contract.distributorId, userId, role);

    if (contract.status !== ContractStatus.pending_signature) {
      throw new BadRequestException('Contract is not pending signature');
    }

    if (hashTerms(contract.termsSnapshot) !== contract.termsHash) {
      throw new BadRequestException('Contract terms integrity check failed');
    }

    return this.prisma.distributorContract.update({
      where: { id },
      data: {
        status: ContractStatus.active,
        signedAt: new Date(),
        signedByUserId: userId,
        signerIp: ip ?? null,
        signerUserAgent: userAgent ?? null,
      },
    });
  }

  async terminate(
    id: string,
    userId: string,
    role: UserRole,
    dto: TerminateContractDto,
  ) {
    const contract = await this.prisma.distributorContract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('Contract not found');

    await this.assertAccess(contract.companyId, contract.distributorId, userId, role);

    if (contract.status === ContractStatus.terminated) {
      throw new BadRequestException('Contract is already terminated');
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.distributorContract.update({
        where: { id },
        data: {
          status: ContractStatus.terminated,
          terminatedAt: new Date(),
          terminationReason: dto.reason,
        },
      });

      await tx.companyDistributor.update({
        where: { id: contract.companyDistributorId },
        data: { status: 'inactive' },
      });

      return updated;
    });
  }
}
