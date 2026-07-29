import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { SearchDistributorProductsDto } from "./dto/search-distributor-products.dto";
import { fastSearchDistributorProductsDto } from "./dto/fastSearch.dto";
const ALLOWED_FIELDS = [
  "id",
  "nameAr",
  "nameEn",
  "dosageForm",
  "packSize",
  "packUnit",
  "packageType",
  "barcode",
  "strength",
  "usageInstructions",
  "price",
  "status",
  "imageUrl",
  "brochureUrl",
  "createdAt",
  "updatedAt",
  "companyId",
  "drugGroups",
  "specializations",
  "quantityAvailable",
  "freeQuantity",
  "lowStockThreshold",
] as const;
type ProductField = (typeof ALLOWED_FIELDS)[number];

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  private parseFields(fields?: string): ProductField[] | null {
    if (!fields) return null;
    return fields
      .split(",")
      .map((f) => f.trim())
      .filter((f) =>
        (ALLOWED_FIELDS as readonly string[]).includes(f),
      ) as ProductField[];
  }

  private pickFields(item: any, fields: ProductField[] | null): any {
    if (!fields || fields.length === 0) return item;
    const result: any = {};
    for (const f of fields) result[f] = item[f];
    return result;
  }

  private buildInclude(fields: ProductField[] | null) {
    if (
      !fields ||
      fields.includes("drugGroups") ||
      fields.includes("specializations")
    ) {
      return {
        ...((!fields || fields.includes("drugGroups")) && {
          productDrugGroups: {
            include: {
              drugGroup: {
                select: {
                  id:true ,nameAr : true,nameEn:true
                }
              },
            },
          },
        }),
        ...((!fields || fields.includes("specializations")) && {
          productSpecializations: {
            include: { specialization: true },
          },
        }),
      };
    }
    return {};
  }

  private format(item: any): any {
    const { productDrugGroups, productSpecializations, inventories, ...rest } = item;
    return {
      ...rest,
      ...(productDrugGroups !== undefined && {
        drugGroups: productDrugGroups.map((r: any) => ({
          ...r.drugGroup,
          // categories:
          //   r.drugGroup.drugGroupCategories?.map((c: any) => c.category) ?? [],
          // drugGroupCategories: undefined,
        })),
      }),
      ...(productSpecializations !== undefined && {
        specializations: productSpecializations.map(
          (r: any) => r.specialization,
        ),
      }),
      ...(inventories !== undefined && {
        quantityAvailable: inventories[0]?.quantityAvailable ?? 0,
        freeQuantity: inventories[0]?.freeQuantity ?? 0,
        lowStockThreshold: inventories[0]?.lowStockThreshold ?? 0,
      }),
    };
  }

  private async resolveCompanyId(userId: string): Promise<string> {
    const profile = await this.prisma.companyProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException("Company profile not found");
    return profile.id;
  }

  async create(userId: string, dto: CreateProductDto) {
    const companyId = await this.resolveCompanyId(userId);
    const { drugGroupIds, specializationIds, ...data } = dto;

    return this.prisma.product.create({
      data: {
        ...data,
        companyToDistributorPrice: data.companyToDistributorPrice as any,
        distributorToPharmacistPrice: data.distributorToPharmacistPrice as any,
        pharmacistToConsumerPrice: data.pharmacistToConsumerPrice as any,
        companyId,
        ...(drugGroupIds?.length && {
          productDrugGroups: {
            create: drugGroupIds.map((id) => ({ drugGroupId: id })),
          },
        }),
        ...(specializationIds?.length && {
          productSpecializations: {
            create: specializationIds.map((id) => ({ specializationId: id })),
          },
        }),
      },
      include: this.buildInclude(null),
    });
  }

  async findAll(filters?: {
    search?: string;
    companyId?: string;
    dosageForm?: string;
    status?: string;
    specializationId?: string;
    distributorId?: string;
    page?: number;
    limit?: number;
    fields?: string;
    userRole?: string;
  }) {
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

    // Status filter
    if (filters?.status) {
      whereConditions.push({ status: filters.status });
    }

    // Specialization filter
    if (filters?.specializationId) {
      whereConditions.push({
        productSpecializations: {
          some: {
            specializationId: filters.specializationId,
          },
        },
      });
    }

    // Distributor filter — only products this distributor carries in their inventory
    if (filters?.distributorId) {
      whereConditions.push({
        inventories: {
          some: {
            distributorId: filters.distributorId,
          },
        },
      });
    }

    // Text search across name fields and drug groups
    if (filters?.search?.trim()) {
      const searchTerm = filters.search.trim();

      // Search in name fields (case-insensitive partial match)
      const nameSearch = {
        OR: [
          { nameAr: { contains: searchTerm, mode: "insensitive" } },
          { nameEn: { contains: searchTerm, mode: "insensitive" } },
        ],
      };

      // Search in drug groups (requires joining with productDrugGroups)
      const drugGroupSearch = {
        productDrugGroups: {
          some: {
            drugGroup: {
              OR: [
                { nameAr: { contains: searchTerm, mode: "insensitive" } },
                { nameEn: { contains: searchTerm, mode: "insensitive" } },
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
        include: {
          ...this.buildInclude(parsedFields),
          ...(filters?.distributorId && {
            inventories: {
              where: { distributorId: filters.distributorId },
              select: {
                quantityAvailable: true,
                freeQuantity: true,
                lowStockThreshold: true,
              },
            },
          }),
        },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: items.map((item) =>
        this.pickFields(this.format(item), parsedFields),
      ),
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
    if (!item) throw new NotFoundException("Product not found");
    return this.pickFields(this.format(item), parsedFields);
  }

  async update(id: string, userId: string, dto: UpdateProductDto) {
    const companyId = await this.resolveCompanyId(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException("Product not found");
    if (product.companyId !== companyId) throw new ForbiddenException();

    const { drugGroupIds, specializationIds, ...data } = dto;

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
        ...(specializationIds && {
          productSpecializations: {
            deleteMany: {},
            create: specializationIds.map((sid) => ({ specializationId: sid })),
          },
        }),
      },
      include: this.buildInclude(null),
    });
  }

  async remove(id: string, userId: string) {
    const companyId = await this.resolveCompanyId(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException("Product not found");
    if (product.companyId !== companyId) throw new ForbiddenException();
    // Delete all related records
    await this.prisma.productDrugGroup.deleteMany({
      where: { productId: product.id },
    });
    await this.prisma.productSpecialization.deleteMany({
      where: { productId: product.id },
    });
    await this.prisma.product.delete({ where: { id } });
    return { message: "Product deleted successfully" };
  }


    async searchDistributorProducts(userId: string, dto: SearchDistributorProductsDto) {
    const pharmacist = await this.prisma.pharmacistProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!pharmacist) throw new NotFoundException('Pharmacist profile not found');

    const page = Math.max(1, dto.page || 1);
    const limit = Math.max(1, Math.min(100, dto.limit || 20));
    const skip = (page - 1) * limit;

    const distributorIdList = dto.distributorIds.split(',').map(id => id.trim()).filter(Boolean);
    const drugGroupIdList = dto.drugGroupIds?.split(',').map(id => id.trim()).filter(Boolean);

    const whereConditions: any[] = [
      // { status: 'active' },
      {
        inventories: {
          some: {
            distributorId: { in: distributorIdList },
            quantityAvailable: { gt: 0 },
          },
        },
      },
    ];

    if (dto.search?.trim()) {
      const term = dto.search.trim();
      whereConditions.push({
        OR: [
          { nameAr: { contains: term, mode: 'insensitive' } },
          { nameEn: { contains: term, mode: 'insensitive' } },
          // {
          //   inventories: {
          //     some: {
          //       distributor: {
          //         companyName: { contains: term, mode: 'insensitive' },
          //       },
          //     },
          //   },
          // },
          {
        productDrugGroups: {
          some: {
            drugGroup: {
              OR: [
                { nameAr: { contains: term, mode: "insensitive" } },
                { nameEn: { contains: term, mode: "insensitive" } },
              ],
            },
          },
        },
      }
        ],
        
      });
    }

    if (drugGroupIdList?.length) {
      whereConditions.push({
        productDrugGroups: {
          some: {
            drugGroupId: { in: drugGroupIdList },
          },
        },
      });
    }

    const companyIdList = dto.companyIds?.split(',').map(id => id.trim()).filter(Boolean);
    if (companyIdList?.length) {
      whereConditions.push({
        companyId: { in: companyIdList },
      });
    }

    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: {
          productDrugGroups: {
            include: { drugGroup: true },
          },
          inventories: {
            where: {
              distributorId: { in: distributorIdList },
              quantityAvailable: { gt: 0 },
            },
            include: {
              distributor: { select: { id: true, companyName: true } },
            },
          },
        },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    const data = items.map(item => ({
      id: item.id,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      dosageForm: item.dosageForm,
      packSize: item.packSize,
      packUnit: item.packUnit,
      strength: item.strength,
      imageUrl: item.imageUrl,
      distributorToPharmacistPrice: item.distributorToPharmacistPrice,
      drugGroups: item.productDrugGroups.map(pdg => pdg.drugGroup),
      distributors: item.inventories.filter(inv => inv.distributor).map(inv => ({
        id: inv.distributor!.id,
        companyName: inv.distributor!.companyName,
        quantityAvailable: inv.quantityAvailable,
      })),
    }));

    return {
      data,
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
    async fastsearchDistributorProducts(userId: string, dto: fastSearchDistributorProductsDto) {
    const pharmacist = await this.prisma.pharmacistProfile.findUnique({
      where: { userId },
      select: { areaId: true },
    });
    if (!pharmacist) throw new NotFoundException('Pharmacist profile not found');
    if (!pharmacist.areaId) throw new BadRequestException('Pharmacist area is not set');

    const coverages = await this.prisma.distributorCoverageArea.findMany({
      where: { areaId: pharmacist.areaId },
      select: { distributorId: true },
      distinct: ['distributorId'],
    });
    let distributorIdList = coverages.map(c => c.distributorId);

    if (dto.distributorIds?.trim()) {
      const requestedIds = dto.distributorIds.split(',').map(id => id.trim()).filter(Boolean);
      distributorIdList = distributorIdList.filter(id => requestedIds.includes(id));
    }

    if (!distributorIdList.length) return [];

    const whereConditions: any[] = [
      {
        inventories: {
          some: {
            distributorId: { in: distributorIdList },
            quantityAvailable: { gt: 0 },
          },
        },
      },
    ];

    if (dto.search?.trim()) {
      const term = dto.search.trim();
      whereConditions.push({
        OR: [
          { nameAr: { contains: term, mode: 'insensitive' } },
          { nameEn: { contains: term, mode: 'insensitive' } },
        ],

      });
    }


    const where = whereConditions.length > 0 ? { AND: whereConditions } : {};
  const items = await this.prisma.product.findMany({
  where,
  take: 6,
  orderBy: {
    nameAr: "asc",
  },
  select: {
    id: true,
    nameAr: true,
    nameEn: true,
    dosageForm: true,
    packSize: true,
    strength: true,
    imageUrl: true,
    distributorToPharmacistPrice: true,

    inventories: {
      where: {
        distributorId: {
          in: distributorIdList,
        },
        quantityAvailable: {
          gt: 0,
        },
      },
      select: {
        quantityAvailable: true,
        distributor: {
          select: {
            id: true,
            companyName: true,
          },
        },
      },
    },
  },
});

    const groups = new Map<string, { distributor: { id: string; companyName: string }; products: any[] }>();

    for (const item of items) {
      const { inventories, ...productBase } = item;
      for (const inv of inventories) {
        if (!inv.distributor) continue;
        if (!groups.has(inv.distributor.id)) {
          groups.set(inv.distributor.id, {
            distributor: { id: inv.distributor.id, companyName: inv.distributor.companyName },
            products: [],
          });
        }
        groups.get(inv.distributor.id)!.products.push({
          ...productBase,
          quantityAvailable: inv.quantityAvailable,
        });
      }
    }

    return Array.from(groups.values());
  }

  async findByBarcodeForPharmacist(userId: string, barcode: string) {
    const product = await this.prisma.product.findUnique({
      where: { barcode },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        dosageForm: true,
        packSize: true,
        packUnit: true,
        strength: true,
        imageUrl: true,
        distributorToPharmacistPrice: true,
        status: true,
        companyId: true,
      },
    });
    if (!product) throw new NotFoundException('Product not found for this barcode');

    const pharmacist = await this.prisma.pharmacistProfile.findUnique({
      where: { userId },
      select: { id: true, areaId: true },
    });
    if (!pharmacist) throw new NotFoundException('Pharmacist profile not found');
    if (!pharmacist.areaId) throw new BadRequestException('Pharmacist area is not set');

    // موزعين يغطون نفس المنطقة
    const coveringDistributors = await this.prisma.distributorCoverageArea.findMany({
      where: { areaId: pharmacist.areaId },
      select: { distributorId: true },
      distinct: ['distributorId'],
    });

    const coveringIds = coveringDistributors.map(c => c.distributorId);

    const inventories = await this.prisma.inventory.findMany({
      where: {
        distributorId: { in: coveringIds },
        productId: product.id,
        quantityAvailable: { gt: 0 },
      },
      include: {
        distributor: { select: { id: true, companyName: true } },
      },
    });

    return {
      ...product,
      distributors: inventories.filter(inv => inv.distributor).map(inv => ({
        id: inv.distributor!.id,
        companyName: inv.distributor!.companyName,
        quantityAvailable: inv.quantityAvailable,
      })),
    };
  }

  async findRelatedByDrugGroup(userId: string, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const pharmacist = await this.prisma.pharmacistProfile.findUnique({
      where: { userId },
      select: { id: true, areaId: true },
    });
    if (!pharmacist) throw new NotFoundException('Pharmacist profile not found');
    if (!pharmacist.areaId) throw new BadRequestException('Pharmacist area is not set');

    const coveringDistributors = await this.prisma.distributorCoverageArea.findMany({
      where: { areaId: pharmacist.areaId },
      select: { distributorId: true },
      distinct: ['distributorId'],
    });
    const distributorIds = coveringDistributors.map(c => c.distributorId);

    const drugGroupIds = await this.prisma.productDrugGroup.findMany({
      where: { productId },
      select: { drugGroupId: true },
    });

    const ids = drugGroupIds.map(dg => dg.drugGroupId);
    if (!ids.length) return [];

    const related = await this.prisma.product.findMany({
      where: {
        id: { not: productId },
        status: 'active',
        productDrugGroups: {
          some: { drugGroupId: { in: ids } },
        },
        inventories: {
          some: {
            distributorId: { in: distributorIds },
            quantityAvailable: { gt: 0 },
          },
        },
      },
      include: {
        productDrugGroups: {
          include: { drugGroup: true },
        },
        inventories: {
          where: {
            distributorId: { in: distributorIds },
            quantityAvailable: { gt: 0 },
          },
          include: {
            distributor: { select: { id: true, companyName: true } },
          },
        },
      },
    });

    return related.map(item => ({
      id: item.id,
      nameAr: item.nameAr,
      nameEn: item.nameEn,
      dosageForm: item.dosageForm,
      packSize: item.packSize,
      packUnit: item.packUnit,
      strength: item.strength,
      imageUrl: item.imageUrl,
      distributorToPharmacistPrice: item.distributorToPharmacistPrice,
      drugGroups: item.productDrugGroups.map(pdg => pdg.drugGroup),
      distributors: item.inventories.filter(inv => inv.distributor).map(inv => ({
        id: inv.distributor!.id,
        companyName: inv.distributor!.companyName,
        quantityAvailable: inv.quantityAvailable,
      })),
    }));
  }

}
