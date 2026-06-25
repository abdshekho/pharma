import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { CreateCityAreaDto } from './dto/create-city-area.dto';
import { UpdateCityAreaDto } from './dto/update-city-area.dto';

@Injectable()
export class CitiesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCityDto) {
    const existing = await this.prisma.city.findFirst({ where: { nameAr: dto.nameAr } });
    if (existing) throw new ConflictException('City with this name already exists');
    return this.prisma.city.create({ data: dto });
  }

  findAll(isActive?: boolean) {
    return this.prisma.city.findMany({
      where: isActive !== undefined ? { isActive } : {},
      orderBy: { nameAr: 'asc' },
    });
  }

  async findOne(id: string) {
    const city = await this.prisma.city.findUnique({
      where: { id },
      include: { areas: { orderBy: { nameAr: 'asc' } } },
    });
    if (!city) throw new NotFoundException('City not found');
    return city;
  }

  async createArea(cityId: string, dto: CreateCityAreaDto) {
    await this.findOne(cityId);

    const existing = await this.prisma.cityArea.findFirst({
      where: { cityId, nameAr: dto.nameAr },
    });
    if (existing) throw new ConflictException('Area with this name already exists in this city');

    return this.prisma.cityArea.create({ data: { cityId, ...dto } });
  }

  async findAreas(cityId: string, isActive?: boolean) {
    await this.findOne(cityId);

    return this.prisma.cityArea.findMany({
      where: { cityId, ...(isActive !== undefined ? { isActive } : {}) },
      orderBy: { nameAr: 'asc' },
    });
  }

  async findArea(cityId: string, areaId: string) {
    const area = await this.prisma.cityArea.findFirst({
      where: { id: areaId, cityId },
      include: { city: true },
    });
    if (!area) throw new NotFoundException('Area not found');
    return area;
  }

  async updateArea(cityId: string, areaId: string, dto: UpdateCityAreaDto) {
    await this.findArea(cityId, areaId);

    if (dto.nameAr) {
      const existing = await this.prisma.cityArea.findFirst({
        where: { cityId, nameAr: dto.nameAr, NOT: { id: areaId } },
      });
      if (existing) throw new ConflictException('Area with this name already exists in this city');
    }

    return this.prisma.cityArea.update({ where: { id: areaId }, data: dto });
  }

  async removeArea(cityId: string, areaId: string) {
    await this.findArea(cityId, areaId);
    await this.prisma.cityArea.delete({ where: { id: areaId } });
    return { message: 'Area deleted successfully' };
  }

  async update(id: string, dto: UpdateCityDto) {
    await this.findOne(id);
    return this.prisma.city.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.city.delete({ where: { id } });
    return { message: 'City deleted successfully' };
  }
}
