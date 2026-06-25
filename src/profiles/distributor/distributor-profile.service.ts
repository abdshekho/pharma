import { Injectable, NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDistributorProfileDto } from './dto/create-distributor-profile.dto';
import { UpdateDistributorProfileDto } from './dto/update-distributor-profile.dto';
import { UserRole } from '@prisma/client';
import { SetCoverageScheduleDto } from './dto/set-coverage-schedule.dto';

@Injectable()
export class DistributorProfileService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateDistributorProfileDto) {
    const existing = await this.prisma.distributorProfile.findUnique({ where: { userId } });
    if (existing) throw new ConflictException('Distributor profile already exists');

    return this.prisma.distributorProfile.create({ data: { userId, ...dto } });
  }

  async findAll() {
    return this.prisma.distributorProfile.findMany({
      include: {
        user: { select: { id: true, email: true, fullName: true, status: true } },
        coverageAreas: { include: { area: { include: { city: true } } } },
      },
    });
  }

  async findOne(id: string) {
    const profile = await this.prisma.distributorProfile.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, email: true, fullName: true, status: true } },
        coverageAreas: { include: { area: { include: { city: true } } } },
      },
    });
    if (!profile) throw new NotFoundException('Distributor profile not found');
    return profile;
  }

  async findByUser(userId: string) {
    const profile = await this.prisma.distributorProfile.findUnique({
      where: { userId },
      include: { coverageAreas: { include: { area: { include: { city: true } } } } },
    });
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

  async findCoverageSchedule(id: string, userId: string, userRole: UserRole) {
    const profile = await this.prisma.distributorProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Distributor profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    return this.prisma.distributorCoverageArea.findMany({
      where: { distributorId: id },
      include: { area: { include: { city: true } } },
      orderBy: [{ dayOfWeek: 'asc' }, { area: { nameAr: 'asc' } }],
    });
  }

  async setCoverageSchedule(id: string, userId: string, userRole: UserRole, dto: SetCoverageScheduleDto) {
    const profile = await this.prisma.distributorProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Distributor profile not found');
    if (userRole !== UserRole.admin && profile.userId !== userId) throw new ForbiddenException('Access denied');

    const areaIds = [...new Set(dto.days.flatMap((day) => day.areaIds))];
    const areas = await this.prisma.cityArea.findMany({
      where: { id: { in: areaIds }, isActive: true },
      select: { id: true },
    });

    if (areas.length !== areaIds.length) {
      throw new BadRequestException('One or more areas do not exist or are inactive');
    }

    const coverageRows = dto.days.flatMap((day) =>
      day.areaIds.map((areaId) => ({
        distributorId: id,
        dayOfWeek: day.dayOfWeek,
        areaId,
      })),
    );

    if (coverageRows.length === 0) {
      await this.prisma.distributorCoverageArea.deleteMany({ where: { distributorId: id } });
      return this.findCoverageSchedule(id, userId, userRole);
    }

    await this.prisma.$transaction([
      this.prisma.distributorCoverageArea.deleteMany({ where: { distributorId: id } }),
      this.prisma.distributorCoverageArea.createMany({
        data: coverageRows,
        skipDuplicates: true,
      }),
    ]);

    return this.findCoverageSchedule(id, userId, userRole);
  }
}
