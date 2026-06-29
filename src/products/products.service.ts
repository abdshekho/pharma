import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const ALLOWED_FIELDS = [
  'id', 'nameAr', 'nameEn', 'dosageForm', 'packSize', 'packUnit', 'packageType',
  'barcode', 'strength', 'usageInstructions', 'price', 'status',
  'imageUrl', 'brochureUrl', 'createdAt', 'updatedAt', 'companyId', 'drugGroups',
] as const;
type ProductField = (typeof ALLOWED_FIELDS)[number];

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private parseFields(fields?: string): ProductField[] | null {
    if (!fields) return null;
    return fields
      .split(',')
      .map((f) => f.trim())
      .filter((f) => (ALLOWED_FIELDS as readonly string[]).includes(f)) as ProductField[];
  }

  private pickFields(item: any, fields: ProductField[] | null): any {
    if (!fields || fields.length === 0) return item;
    const result: any = {};
    for (const f of fields) result[f] = item[f];
    return result;
  }

  private buildInclude(fields: ProductField[] | null) {
    if (!fields || fields.includes('drugGroups')) {
      return {
        productDrugGroups: {
          include: {
            drugGroup: {
              include: { drugGroupCategories: { include: { category: true } } },
            },
          },
        },
      };
    }
    return {};
  }

  private format(item: any): any {
    const { productDrugGroups, ...rest } = item;
    return {
      ...rest,
      ...(productDrugGroups !== undefined && {
        drugGroups: productDrugGroups.map((r: any) => ({
          ...r.drugGroup,
          categories: r.drugGroup.drugGroupCategories?.map((c: any) => c.category) ?? [],
          drugGroupCategories: undefined,
        })),
      }),
    };
  }

  private async resolveCompanyId(userId: string): Promise<string> {
    const profile = await this.prisma.companyProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Company profile not found');
    return profile.id;
  }

  async create(userId: string, dto: CreateProductDto) {
    const companyId = await this.resolveCompanyId(userId);
    const { drugGroupIds, ...data } = dto;

    return this.prisma.product.create({
      data: {
        ...data,
        companyToDistributorPrice: data.companyToDistributorPrice as any,
        distributorToPharmacistPrice: data.distributorToPharmacistPrice as any,
        pharmacistToConsumerPrice: data.pharmacistToConsumerPrice as any,
        companyId,
        ...(drugGroupIds?.length && {
          productDrugGroups: { create: drugGroupIds.map((id) => ({ drugGroupId: id })) },
        }),
      },
      include: this.buildInclude(null),
    });
  }

  async findAll(
    filters?: { 
      search?: string; 
      companyId?: string; 
      dosageForm?: string;
      page?: number; 
      limit?: number; 
      fields?: string;
      userRole?: string;
    },
  ) {
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.max(1, Math.min(100, filters?.limit || 20));
    const skip = (page - 1) * limit;
    
    const parsedFields = this.parseFields(filters?.fields);
    
    // Build search and filter conditions
    const whereConditions: any[] = [];
    
    // Company filter
    if (filters?.companyId) {
      whereConditions.push({ companyId: filters.companyId });
    }
    
    // Dosage form filter
    if (filters?.dosageForm) {
      whereConditions.push({ dosageForm: filters.dosageForm });
    }
    
    // Text search across name fields and drug groups
    if (filters?.search?.trim()) {
      const searchTerm = filters.search.trim();
      
      // Search in name fields (case-insensitive partial match)
      const nameSearch = {
        OR: [
          { nameAr: { contains: searchTerm, mode: 'insensitive' } },
          { nameEn: { contains: searchTerm, mode: 'insensitive' } },
        ],
      };
      
      // Search in drug groups (requires joining with productDrugGroups)
      const drugGroupSearch = {
        productDrugGroups: {
          some: {
            drugGroup: {
              OR: [
                { nameAr: { contains: searchTerm, mode: 'insensitive' } },
                { nameEn: { contains: searchTerm, mode: 'insensitive' } },
              ],
            },
          },
        },
      };
      
      whereConditions.push({
        OR: [nameSearch, drugGroupSearch],
      });
    }
    
    // Combine all conditions with AND
    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    // Include product prices in the query
    
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: this.buildInclude(parsedFields),
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: items.map((item) => this.pickFields(this.format(item), parsedFields)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }


  async findOne(id: string, fields?: string) {
    const parsedFields = this.parseFields(fields);
    const item = await this.prisma.product.findUnique({
      where: { id },
      include: this.buildInclude(parsedFields),
    });
    if (!item) throw new NotFoundException('Product not found');
    return this.pickFields(this.format(item), parsedFields);
  }

  async update(id: string, userId: string, dto: UpdateProductDto) {
    const companyId = await this.resolveCompanyId(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.companyId !== companyId) throw new ForbiddenException();

    const { drugGroupIds, ...data } = dto;

    return this.prisma.product.update({
      where: { id },
      data: {
        ...data,
        companyToDistributorPrice: data.companyToDistributorPrice as any,
        distributorToPharmacistPrice: data.distributorToPharmacistPrice as any,
        pharmacistToConsumerPrice: data.pharmacistToConsumerPrice as any,
        ...(drugGroupIds && {
          productDrugGroups: {
            deleteMany: {},
            create: drugGroupIds.map((gid) => ({ drugGroupId: gid })),
          },
        }),
      },
      include: this.buildInclude(null),
    });
  }

  async remove(id: string, userId: string) {
    const companyId = await this.resolveCompanyId(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.companyId !== companyId) throw new ForbiddenException();
    // Delete all related records
    await this.prisma.productDrugGroup.deleteMany({ where: { productId: product.id } });
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted successfully' };
  }

  
}