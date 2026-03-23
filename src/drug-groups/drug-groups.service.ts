import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDrugGroupDto } from './dto/create-drug-group.dto';
import { UpdateDrugGroupDto } from './dto/update-drug-group.dto';

const ALLOWED_FIELDS = ['id', 'nameAr', 'nameEn', 'description', 'isActive', 'createdAt', 'categories', 'products'] as const;
type DrugGroupField = (typeof ALLOWED_FIELDS)[number];

const productInclude = {
  id: true,
  nameAr: true,
  nameEn: true,
  dosageForm: true,
  strength: true,
  packSize: true,
  packUnit: true,
  packageType: true,
  price: true,
  status: true,
  imageUrl: true,
};

@Injectable()
export class DrugGroupsService {
  constructor(private prisma: PrismaService) {}

  private parseFields(fields?: string): DrugGroupField[] | null {
    if (!fields) return null;
    return fields
      .split(',')
      .map((f) => f.trim())
      .filter((f) => (ALLOWED_FIELDS as readonly string[]).includes(f)) as DrugGroupField[];
  }

  private pickFields(item: any, fields: DrugGroupField[] | null): any {
    if (!fields || fields.length === 0) return item;
    const result: any = {};
    for (const f of fields) result[f] = item[f];
    return result;
  }

  private buildInclude(fields: DrugGroupField[] | null) {
    if (!fields) return { drugGroupCategories: { include: { category: true } }, productDrugGroups: { include: { product: { select: productInclude } } } };
    return {
      ...(fields.includes('categories') && { drugGroupCategories: { include: { category: true } } }),
      ...(fields.includes('products') && { productDrugGroups: { include: { product: { select: productInclude } } } }),
    };
  }

  private format(item: any): any {
    const { drugGroupCategories, productDrugGroups, ...rest } = item;
    return {
      ...rest,
      ...(drugGroupCategories !== undefined && { categories: drugGroupCategories.map((r: any) => r.category) }),
      ...(productDrugGroups !== undefined && { products: productDrugGroups.map((r: any) => r.product) }),
    };
  }

  async create(dto: CreateDrugGroupDto) {
    const existing = await this.prisma.drugGroup.findUnique({ where: { nameAr: dto.nameAr } });
    if (existing) throw new ConflictException('DrugGroup with this name already exists');

    const { categoryIds, ...data } = dto;

    return this.prisma.drugGroup.create({
      data: {
        ...data,
        ...(categoryIds?.length && {
          drugGroupCategories: { create: categoryIds.map((id) => ({ categoryId: id })) },
        }),
      },
      include: { drugGroupCategories: { include: { category: true } } },
    });
  }

  async findAll(fields?: string) {
    const parsedFields = this.parseFields(fields);
    const items = await this.prisma.drugGroup.findMany({
      include: this.buildInclude(parsedFields),
      orderBy: { nameAr: 'asc' },
    });
    return items.map((item) => this.pickFields(this.format(item), parsedFields));
  }

  async findOne(id: string, fields?: string) {
    const parsedFields = this.parseFields(fields);
    const item = await this.prisma.drugGroup.findUnique({
      where: { id },
      include: this.buildInclude(parsedFields),
    });
    if (!item) throw new NotFoundException('DrugGroup not found');
    return this.pickFields(this.format(item), parsedFields);
  }

  async update(id: string, dto: UpdateDrugGroupDto) {
    await this.findOne(id);
    const { categoryIds, ...data } = dto;

    return this.prisma.drugGroup.update({
      where: { id },
      data: {
        ...data,
        ...(categoryIds && {
          drugGroupCategories: {
            deleteMany: {},
            create: categoryIds.map((cid) => ({ categoryId: cid })),
          },
        }),
      },
      include: { drugGroupCategories: { include: { category: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.drugGroup.delete({ where: { id } });
    return { message: 'DrugGroup deleted successfully' };
  }
}
