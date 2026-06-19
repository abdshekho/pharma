import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BarcodeUtil } from './utils/barcode.util';
import { getPriceTypeForRoleForCreation } from './utils/price.util';
import { PriceType, Prisma } from '@prisma/client';

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

  private format(item: any, currentUserRole?: string): any {
    const { productDrugGroups, productPrices, ...rest } = item;
    
    // Get the appropriate price for the user role
    let displayPrice = null;
    let allPrices = null;
    
    if (productPrices) {
      // If user is admin, show all prices
      if (currentUserRole === 'admin') {
        allPrices = productPrices;
        displayPrice = productPrices.find((p: any) => p.priceType === 'company_to_distributor')?.price || rest.price;
      } else {
        // Filter prices based on role
        const priceType = this.getPriceTypeForDisplay(currentUserRole);
        if (priceType) {
          const priceRecord = productPrices.find((p: any) => p.priceType === priceType);
          displayPrice = priceRecord?.price || rest.price;
        } else {
          displayPrice = rest.price;
        }
      }
    } else {
      displayPrice = rest.price;
    }
    
    const result: any = {
      ...rest,
      price: displayPrice,
    };
    
    if (allPrices) {
      result.allPrices = allPrices;
    }
    
    if (productDrugGroups !== undefined) {
      result.drugGroups = productDrugGroups.map((r: any) => ({
        ...r.drugGroup,
        categories: r.drugGroup.drugGroupCategories?.map((c: any) => c.category) ?? [],
        drugGroupCategories: undefined,
      }));
    }
    
    return result;
  }

  private getPriceTypeForDisplay(role?: string): string | null {
    if (!role) return null;
    
    switch (role) {
      case 'company':
        return 'company_to_distributor';
      case 'distributor':
        return 'distributor_to_pharmacist';
      case 'pharmacist':
        return 'pharmacist_to_consumer';
      case 'doctor':
      case 'representative':
        return 'pharmacist_to_consumer';
      case 'admin':
        return null; // Admin sees all
      default:
        return 'pharmacist_to_consumer';
    }
  }

  private async resolveCompanyId(userId: string): Promise<string> {
    const profile = await this.prisma.companyProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new NotFoundException('Company profile not found');
    return profile.id;
  }

  async create(userId: string, dto: CreateProductDto) {
    const companyId = await this.resolveCompanyId(userId);
    const { 
      drugGroupIds, 
      companyToDistributorPrice,
      distributorToPharmacistPrice,
      pharmacistToConsumerPrice,
      ...data 
    } = dto;

    // Generate barcode if not provided
    if (!data.barcode) {
      // You can enable auto-generation by uncommenting the line below
      // data.barcode = BarcodeUtil.generateEAN13();
    }

    // Get user to determine role
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    const role = user?.role as any;
    const priceType = getPriceTypeForRoleForCreation(role);
    
    // Create product with base price
    const product = await this.prisma.product.create({
      data: {
        ...data,
        // Store the base price (company_to_distributor) in the price field for backward compatibility
        price: companyToDistributorPrice ? (companyToDistributorPrice as any) : (data.price as any),
        companyId,
        ...(drugGroupIds?.length && {
          productDrugGroups: { create: drugGroupIds.map((id) => ({ drugGroupId: id })) },
        }),
      },
    });

    // Create price records for each price type
    const priceRecords: any[] = [];
    
    // Company to Distributor price
    if (companyToDistributorPrice) {
      priceRecords.push({
        productId: product.id,
        priceType: PriceType.company_to_distributor,
        price: companyToDistributorPrice,
        createdBy: userId,
      });
    }
    
    // Distributor to Pharmacist price
    if (distributorToPharmacistPrice) {
      priceRecords.push({
        productId: product.id,
        priceType: PriceType.distributor_to_pharmacist,
        price: distributorToPharmacistPrice,
        createdBy: userId,
      });
    }
    
    // Pharmacist to Consumer price
    if (pharmacistToConsumerPrice) {
      priceRecords.push({
        productId: product.id,
        priceType: PriceType.pharmacist_to_consumer,
        price: pharmacistToConsumerPrice,
        createdBy: userId,
      });
    }

    // Create price records if any were provided
    if (priceRecords.length > 0) {
      await this.prisma.productPrice.createMany({
        data: priceRecords,
      });
    }

    // Return the product with its prices
    return this.prisma.product.findUnique({
      where: { id: product.id },
      include: {
        ...this.buildInclude(null),
        productPrices: {
          where: { effectiveTo: null },
          orderBy: { createdAt: Prisma.SortOrder.desc },
        },
      },
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
    const include = {
      ...this.buildInclude(parsedFields),
      productPrices: {
        where: { effectiveTo: null },
        orderBy: { createdAt: Prisma.SortOrder.desc },
      },
    };
    
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include,
        orderBy: { createdAt: Prisma.SortOrder.desc },
        skip,
        take: limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: items.map((item) => this.pickFields(this.format(item, filters?.userRole), parsedFields)),
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

  async findByBarcode(barcode: string, fields?: string, userRole?: string) {
    const parsedFields = this.parseFields(fields);
    // Include product prices in the query
    const include = {
      ...this.buildInclude(parsedFields),
      productPrices: {
        where: { effectiveTo: null },
        orderBy: { createdAt: Prisma.SortOrder.desc },
      },
    };
    
    const item = await this.prisma.product.findUnique({
      where: { barcode },
      include,
    });
    if (!item) throw new NotFoundException('Product not found with this barcode');
    return this.pickFields(this.format(item, userRole), parsedFields);
  }

  async validateBarcodeUnique(barcode: string, excludeProductId?: string): Promise<boolean> {
    const where: any = { barcode };
    if (excludeProductId) {
      where.id = { not: excludeProductId };
    }
    
    const existing = await this.prisma.product.findFirst({ where });
    return !existing; // true if barcode is unique
  }

  async generateUniqueBarcode(): Promise<string> {
    let attempts = 0;
    const maxAttempts = 10;
    
    while (attempts < maxAttempts) {
      const barcode = BarcodeUtil.generateEAN13();
      const isUnique = await this.validateBarcodeUnique(barcode);
      
      if (isUnique) {
        return barcode;
      }
      attempts++;
    }
    
    throw new Error('Failed to generate unique barcode after multiple attempts');
  }

  async findOne(id: string, fields?: string, userRole?: string) {
    const parsedFields = this.parseFields(fields);
    // Include product prices in the query
    const include = {
      ...this.buildInclude(parsedFields),
      productPrices: {
        where: { effectiveTo: null },
        orderBy: { createdAt: Prisma.SortOrder.desc },
      },
    };
    
    const item = await this.prisma.product.findUnique({
      where: { id },
      include,
    });
    if (!item) throw new NotFoundException('Product not found');
    return this.pickFields(this.format(item, userRole), parsedFields);
  }

  async update(id: string, userId: string, dto: UpdateProductDto) {
    const companyId = await this.resolveCompanyId(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.companyId !== companyId) throw new ForbiddenException();

    const { 
      drugGroupIds, 
      companyToDistributorPrice,
      distributorToPharmacistPrice,
      pharmacistToConsumerPrice,
      ...data 
    } = dto;

    // Update product
    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        ...data,
        // Update the base price if company_to_distributor price is provided
        price: companyToDistributorPrice ? (companyToDistributorPrice as any) : (data.price as any),
        ...(drugGroupIds && {
          productDrugGroups: {
            deleteMany: {},
            create: drugGroupIds.map((gid) => ({ drugGroupId: gid })),
          },
        }),
      },
    });

    // Update price records for each price type
    if (companyToDistributorPrice || distributorToPharmacistPrice || pharmacistToConsumerPrice) {
      // Get existing active prices
      const existingPrices = await this.prisma.productPrice.findMany({
        where: { 
          productId: id,
          effectiveTo: null 
        },
      });

      // Mark old prices as expired
      if (existingPrices.length > 0) {
        await this.prisma.productPrice.updateMany({
          where: { 
            productId: id,
            effectiveTo: null 
          },
          data: { effectiveTo: new Date() },
        });
      }

      // Create new price records
      const priceRecords: any[] = [];
      
      // Company to Distributor price
      if (companyToDistributorPrice) {
        priceRecords.push({
          productId: id,
          priceType: PriceType.company_to_distributor,
          price: companyToDistributorPrice,
          createdBy: userId,
        });
      } else {
        // Keep the existing price if not updated
        const existingPrice = existingPrices.find(p => p.priceType === PriceType.company_to_distributor);
        if (existingPrice) {
          priceRecords.push({
            productId: id,
            priceType: PriceType.company_to_distributor,
            price: existingPrice.price,
            createdBy: userId,
          });
        }
      }
      
      // Distributor to Pharmacist price
      if (distributorToPharmacistPrice) {
        priceRecords.push({
          productId: id,
          priceType: PriceType.distributor_to_pharmacist,
          price: distributorToPharmacistPrice,
          createdBy: userId,
        });
      } else {
        // Keep the existing price if not updated
        const existingPrice = existingPrices.find(p => p.priceType === PriceType.distributor_to_pharmacist);
        if (existingPrice) {
          priceRecords.push({
            productId: id,
            priceType: PriceType.distributor_to_pharmacist,
            price: existingPrice.price,
            createdBy: userId,
          });
        }
      }
      
      // Pharmacist to Consumer price
      if (pharmacistToConsumerPrice) {
        priceRecords.push({
          productId: id,
          priceType: PriceType.pharmacist_to_consumer,
          price: pharmacistToConsumerPrice,
          createdBy: userId,
        });
      } else {
        // Keep the existing price if not updated
        const existingPrice = existingPrices.find(p => p.priceType === PriceType.pharmacist_to_consumer);
        if (existingPrice) {
          priceRecords.push({
            productId: id,
            priceType: PriceType.pharmacist_to_consumer,
            price: existingPrice.price,
            createdBy: userId,
          });
        }
      }

      // Create new price records
      if (priceRecords.length > 0) {
        await this.prisma.productPrice.createMany({
          data: priceRecords,
        });
      }
    }

    // Return the product with its prices
    return this.prisma.product.findUnique({
      where: { id },
      include: {
        ...this.buildInclude(null),
        productPrices: {
          where: { effectiveTo: null },
          orderBy: { createdAt: Prisma.SortOrder.desc },
        },
      },
    });
  }

  async remove(id: string, userId: string) {
    const companyId = await this.resolveCompanyId(userId);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) throw new NotFoundException('Product not found');
    if (product.companyId !== companyId) throw new ForbiddenException();
    await this.prisma.product.delete({ where: { id } });
    return { message: 'Product deleted successfully' };
  }
}