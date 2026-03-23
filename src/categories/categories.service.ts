import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

const ALLOWED_FIELDS = ['id', 'nameAr', 'nameEn', 'icon', 'isActive', 'parentId'] as const;
type CategoryField = (typeof ALLOWED_FIELDS)[number];

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private parseFields(fields?: string): CategoryField[] | null {
    if (!fields) return null;
    const requested = fields.split(',').map((f) => f.trim());
    return requested.filter((f) =>
      (ALLOWED_FIELDS as readonly string[]).includes(f),
    ) as CategoryField[];
  }

  private pickFields(category: any, fields: CategoryField[] | null): any {
    if (!fields || fields.length === 0) return category;
    const result: any = {};
    for (const f of fields) result[f] = category[f];
    if (category.children)
      result['children'] = category.children.map((c: any) => this.pickFields(c, fields));
    return result;
  }

  private async loadTree(where: any, isActive?: boolean): Promise<any[]> {
    const activeWhere = isActive !== undefined ? { isActive } : {};
    const categories = await this.prisma.category.findMany({
      where,
      orderBy: { nameAr: 'asc' },
    });
    return Promise.all(
      categories.map(async (cat) => ({
        ...cat,
        children: await this.loadTree({ parentId: cat.id, ...activeWhere }, isActive),
      })),
    );
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findFirst({ where: { nameAr: dto.nameAr } });
    if (existing) throw new ConflictException('Category with this name already exists');

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    return this.prisma.category.create({ data: dto });
  }

  async findAll(isActive?: boolean, fields?: string) {
    const parsedFields = this.parseFields(fields);
    const activeWhere = isActive !== undefined ? { isActive } : {};
    const tree = await this.loadTree({ parentId: null, ...activeWhere }, isActive);
    return tree.map((cat) => this.pickFields(cat, parsedFields));
  }

  async findOne(id: string, fields?: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    const withChildren = {
      ...category,
      children: await this.loadTree({ parentId: id }),
    };
    return this.pickFields(withChildren, this.parseFields(fields));
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.findOne(id);

    if (dto.parentId) {
      if (dto.parentId === id) throw new BadRequestException('Category cannot be its own parent');
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    const category = await this.findOne(id);
    if (category.children?.length > 0)
      throw new BadRequestException('Cannot delete category with subcategories');
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted successfully' };
  }
}
