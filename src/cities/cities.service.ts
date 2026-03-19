import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';

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
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) throw new NotFoundException('City not found');
    return city;
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
