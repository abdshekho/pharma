import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSpecializationDto } from './dto/create-specialization.dto';
import { UpdateSpecializationDto } from './dto/update-specialization.dto';

const ALLOWED_FIELDS = ['id', 'nameAr', 'nameEn', 'icon', 'isActive', 'parentId','description'] as const;
type SpecializationField = (typeof ALLOWED_FIELDS)[number];

@Injectable()
export class SpecializationsService {
  constructor (private prisma: PrismaService) { }
  
  private parseFields(fields?: string): SpecializationField[] | null {
    if (!fields) return null;
    const requested = fields.split(',').map((f) => f.trim());
    return requested.filter((f) =>
      (ALLOWED_FIELDS as readonly string[]).includes(f),
    ) as SpecializationField[];
  }

  private pickFields(specialization: any, fields: SpecializationField[] | null): any {
    if (!fields || fields.length === 0) return specialization;
    const result: any = {};
    for (const f of fields) result[f] = specialization[f];
    return result;
  }

  async create(dto: CreateSpecializationDto) {
    const existing = await this.prisma.specialization.findFirst({ where: { nameAr: dto.nameAr } });
    if (existing) throw new ConflictException('Specialization with this name already exists');

    if (dto.parentId) {
      const parent = await this.prisma.specialization.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent specialization not found');
    }

    return this.prisma.specialization.create({ data: dto });
  }

  async findAll(isActive?: boolean, fields?: string) {
    const parsedFields = this.parseFields(fields);
    const where: any = {};
    
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    const specializations = await this.prisma.specialization.findMany({ 
      where,
      orderBy: { nameAr: 'asc' }
    });
    
    return specializations.map((spec) => this.pickFields(spec, parsedFields));
  }

  async findOne(id: string, fields?: string) {
    const spec = await this.prisma.specialization.findUnique({ where: { id } });
    if (!spec) throw new NotFoundException('Specialization not found');
    return this.pickFields(spec, this.parseFields(fields));
  }

  async update(id: string, dto: UpdateSpecializationDto) {
    await this.findOne(id);

    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('Specialization cannot be its own parent');
      const parent = await this.prisma.specialization.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent specialization not found');
    }

    return this.prisma.specialization.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    // التحقق من وجود تخصصات فرعية
    const children = await this.prisma.specialization.findMany({
      where: { parentId: id }
    });
    
    if (children.length > 0) {
      throw new BadRequestException('Cannot delete specialization with sub-specializations');
    }
    
    await this.prisma.specialization.delete({ where: { id } });
    return { message: 'Specialization deleted successfully' };
  }
}