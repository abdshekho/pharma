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

  private pickFields(category: any, fields: SpecializationField[] | null): any {
    if (!fields || fields.length === 0) return category;
    const result: any = {};
    for (const f of fields) result[f] = category[f];
    if (category.children)
      result['children'] = category.children.map((c: any) => this.pickFields(c, fields));
    return result;
  }

  private async loadTree(where: any, isActive?: boolean): Promise<any[]> {
    const activeWhere = isActive !== undefined ? { isActive } : {};
    const items = await this.prisma.specialization.findMany({
      where,
      orderBy: { nameAr: 'asc' },
    });
    return Promise.all(
      items.map(async (s) => ({
        ...s,
        children: await this.loadTree({ parentId: s.id, ...activeWhere }, isActive),
      })),
    );
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
    const activeWhere = isActive !== undefined ? { isActive } : {};
    const tree = await this.loadTree({ parentId: null, ...activeWhere }, isActive);
    return tree.map((cat) => this.pickFields(cat, parsedFields));
  }

  async findOne(id: string, fields?: string) {
    const spec = await this.prisma.specialization.findUnique({ where: { id } });
    if (!spec) throw new NotFoundException('Specialization not found');
        const withChildren = {
      ...spec,
      children: await this.loadTree({ parentId: id }),
    };
    // return { ...spec, children: await this.loadTree({ parentId: id }) };
    return this.pickFields(withChildren, this.parseFields(fields));
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
    const spec = await this.findOne(id);
    if (spec.children?.length > 0)
      throw new BadRequestException('Cannot delete specialization with sub-specializations');
    await this.prisma.specialization.delete({ where: { id } });
    return { message: 'Specialization deleted successfully' };
  }
}
