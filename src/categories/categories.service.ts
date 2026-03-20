import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findFirst({ where: { nameAr: dto.nameAr } });
    if (existing) throw new ConflictException('Category with this name already exists');

    if (dto.parentId) {
      const parent = await this.prisma.category.findUnique({ where: { id: dto.parentId } });
      if (!parent) throw new NotFoundException('Parent category not found');
    }

    return this.prisma.category.create({ data: dto });
  }

  // إرجاع الـ tree: الـ root categories مع أبنائها
  findAll(isActive?: boolean) {
    const where = isActive !== undefined ? { isActive } : {};
    return this.prisma.category.findMany({
      where: { ...where, parentId: null },
      include: { children: { where, orderBy: { nameAr: 'asc' } } },
      orderBy: { nameAr: 'asc' },
    });
  }

  async findOne(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: { orderBy: { nameAr: 'asc' } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
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
    if (category.children.length > 0)
      throw new BadRequestException('Cannot delete category with subcategories');
    await this.prisma.category.delete({ where: { id } });
    return { message: 'Category deleted successfully' };
  }
}
