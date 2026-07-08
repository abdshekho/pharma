import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  InventoryMovementType,
  InventoryOwnerType,
  InventoryReferenceType,
  UserRole,
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AddInventoryStockDto } from "./dto/add-inventory-stock.dto";
import { AdjustInventoryStockDto } from "./dto/adjust-inventory-stock.dto";
import { IncreaseFreeQuantityDto } from "./dto/increase-free-quantity.dto";

type InventoryOwner = {
  ownerType: InventoryOwnerType;
  ownerId: string;
};

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async addStockForUser(
    userId: string,
    role: UserRole,
    dto: AddInventoryStockDto,
  ) {
    const owner = await this.resolveOwner(userId, role);
    await this.validateProductAccess(owner, dto.productId);
    this.validateFreeQuantityOwner(owner, dto.freeQuantity);

    return this.prisma.$transaction((tx) =>
      this.increaseStock(
        owner,
        dto.productId,
        dto.quantity,
        userId,
        InventoryReferenceType.manual,
        undefined,
        dto.note,
        tx,
        dto.lowStockThreshold,
        dto.freeQuantity,
      ),
    );
  }

  async adjustStockForUser(
    userId: string,
    role: UserRole,
    dto: AdjustInventoryStockDto,
  ) {
    const owner = await this.resolveOwner(userId, role);
    await this.validateProductAccess(owner, dto.productId);
    this.validateFreeQuantityOwner(owner, dto.freeQuantity);

    return this.prisma.$transaction((tx) =>
      this.adjustStock(
        owner,
        dto.productId,
        dto.quantity,
        userId,
        InventoryReferenceType.adjustment,
        undefined,
        dto.note,
        tx,
        dto.freeQuantity,
      ),
    );
  }

  async increaseFreeQuantity(
    userId: string,
    role: UserRole,
    dto: IncreaseFreeQuantityDto,
  ) {
    if (role !== UserRole.company) {
      throw new ForbiddenException("Only companies can manage free samples");
    }

    const owner = await this.resolveOwner(userId, role);
    await this.validateProductAccess(owner, dto.productId);

    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: this.ownerProductUnique(owner, dto.productId),
      });

      if (!inventory) {
        return tx.inventory.create({
          data: {
            ownerType: owner.ownerType,
            ...this.ownerData(owner),
            productId: dto.productId,
            quantityAvailable: 0,
            freeQuantity: dto.quantity,
            lowStockThreshold: 10,
          },
        });
      }

      const updated = await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          freeQuantity: { increment: dto.quantity },
          lastUpdated: new Date(),
        },
      });

      await this.createMovement(
        inventory.id,
        owner.ownerType,
        dto.productId,
        InventoryMovementType.in,
        dto.quantity,
        userId,
        InventoryReferenceType.manual,
        undefined,
        dto.note ?? "Increase free samples",
        tx,
      );

      return updated;
    });
  }
  async decreaseFreeQuantity(
    userId: string,
    role: UserRole,
    dto: IncreaseFreeQuantityDto,
  ) {
    if (role !== UserRole.company) {
      throw new ForbiddenException("Only companies can manage free samples");
    }

    const owner = await this.resolveOwner(userId, role);
    await this.validateProductAccess(owner, dto.productId);

    return this.prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({
        where: this.ownerProductUnique(owner, dto.productId),
      });

      if (!inventory) {
      throw new BadRequestException("Inventory record not found");
      }
      if(inventory.freeQuantity < dto.quantity){
        throw new BadRequestException(`the current free quantity is ${inventory.freeQuantity} and you want to decrease ${dto.quantity}`);
      }

      const updated = await tx.inventory.update({
        where: { id: inventory.id },
        data: {
          freeQuantity: { decrement: dto.quantity },
          lastUpdated: new Date(),
        },
      });

      await this.createMovement(
        inventory.id,
        owner.ownerType,
        dto.productId,
        InventoryMovementType.out,
        dto.quantity,
        userId,
        InventoryReferenceType.manual,
        undefined,
        dto.note ?? "decrement free samples",
        tx,
      );

      return updated;
    });
  }

  async findAllForUser(userId: string, role: UserRole) {
    const owner = await this.resolveOwner(userId, role);

    return this.prisma.inventory.findMany({
      where: this.ownerWhere(owner),
      include: {
        product: { select: { nameAr: true, nameEn: true, imageUrl: true } },
      },
      orderBy: { lastUpdated: "desc" },
    });
  }

  async findMovementsForUser(
    userId: string,
    role: UserRole,
    productId?: string,
  ) {
    const owner = await this.resolveOwner(userId, role);
    const inventoryWhere = this.ownerWhere(owner);

    return this.prisma.stockMovement.findMany({
      where: {
        inventory: inventoryWhere,
        ...(productId && { productId }),
      },
      include: { product: { select: { nameAr: true, nameEn: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async transferForOrder(
    from: InventoryOwner,
    to: InventoryOwner,
    orderId: string,
    items: { productId: string; quantity: number }[],
    createdBy: string,
    tx: any,
  ) {
    for (const item of items) {
      await this.decreaseStock(
        from,
        item.productId,
        item.quantity,
        createdBy,
        InventoryReferenceType.order,
        orderId,
        tx,
      );

      await this.increaseStock(
        to,
        item.productId,
        item.quantity,
        createdBy,
        InventoryReferenceType.order,
        orderId,
        undefined,
        tx,
      );
    }
  }

  async decreaseForOrder(
    from: InventoryOwner,
    orderId: string,
    items: { productId: string; quantity: number }[],
    createdBy: string,
    tx: any,
  ) {
    for (const item of items) {
      await this.decreaseStock(
        from,
        item.productId,
        item.quantity,
        createdBy,
        InventoryReferenceType.order,
        orderId,
        tx,
      );
    }
  }

  async increaseForOrder(
    to: InventoryOwner,
    orderId: string,
    items: { productId: string; quantity: number }[],
    createdBy: string,
    tx: any,
  ) {
    for (const item of items) {
      await this.increaseStock(
        to,
        item.productId,
        item.quantity,
        createdBy,
        InventoryReferenceType.order,
        orderId,
        undefined,
        tx,
      );
    }
  }

  async increaseStock(
    owner: InventoryOwner,
    productId: string,
    quantity: number,
    createdBy: string | null,
    referenceType: InventoryReferenceType,
    referenceId: string | undefined,
    note: string | undefined,
    tx: any,
    lowStockThreshold?: number,
    freeQuantity?: number,
  ) {
    if (quantity <= 0)
      throw new BadRequestException("Quantity must be greater than zero");

    const inventory = await tx.inventory.upsert({
      where: this.ownerProductUnique(owner, productId),
      create: {
        ownerType: owner.ownerType,
        ...this.ownerData(owner),
        productId,
        quantityAvailable: quantity,
        freeQuantity: freeQuantity ?? 0,
        lowStockThreshold: lowStockThreshold ?? 10,
      },
      update: {
        quantityAvailable: { increment: quantity },
        ...(freeQuantity !== undefined && {
          freeQuantity: { increment: freeQuantity },
        }),
        ...(lowStockThreshold !== undefined && { lowStockThreshold }),
        lastUpdated: new Date(),
      },
    });

    await this.createMovement(
      inventory.id,
      owner.ownerType,
      productId,
      InventoryMovementType.in,
      quantity,
      createdBy,
      referenceType,
      referenceId,
      note,
      tx,
    );

    return inventory;
  }

  async decreaseStock(
    owner: InventoryOwner,
    productId: string,
    quantity: number,
    createdBy: string | null,
    referenceType: InventoryReferenceType,
    referenceId: string | undefined,
    tx: any,
  ) {
    if (quantity <= 0)
      throw new BadRequestException("Quantity must be greater than zero");

    const inventory = await tx.inventory.findUnique({
      where: this.ownerProductUnique(owner, productId),
    });
    if (!inventory) throw new BadRequestException("Inventory record not found");
    if (inventory.quantityAvailable < quantity) {
      throw new BadRequestException("Insufficient stock");
    }

    const updated = await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        quantityAvailable: { decrement: quantity },
        lastUpdated: new Date(),
      },
    });

    await this.createMovement(
      inventory.id,
      owner.ownerType,
      productId,
      InventoryMovementType.out,
      quantity,
      createdBy,
      referenceType,
      referenceId,
      undefined,
      tx,
    );

    return updated;
  }

  private async adjustStock(
    owner: InventoryOwner,
    productId: string,
    quantity: number,
    createdBy: string,
    referenceType: InventoryReferenceType,
    referenceId: string | undefined,
    note: string | undefined,
    tx: any,
    freeQuantity?: number,
  ) {
    const inventory = await tx.inventory.findUnique({
      where: this.ownerProductUnique(owner, productId),
    });
    if (!inventory) throw new NotFoundException("Inventory record not found");

    const newQty = inventory.quantityAvailable + quantity;
    if (newQty < 0)
      throw new BadRequestException(
        "Adjustment would result in negative stock",
      );
    const newFreeQty = inventory.freeQuantity + (freeQuantity ?? 0);
    if (newFreeQty < 0)
      throw new BadRequestException(
        "Adjustment would result in negative free stock",
      );

    const updated = await tx.inventory.update({
      where: { id: inventory.id },
      data: {
        quantityAvailable: newQty,
        ...(freeQuantity !== undefined && { freeQuantity: newFreeQty }),
        lastUpdated: new Date(),
      },
    });

    await this.createMovement(
      inventory.id,
      owner.ownerType,
      productId,
      InventoryMovementType.adjustment,
      quantity,
      createdBy,
      referenceType,
      referenceId,
      note,
      tx,
    );

    return updated;
  }

  private async createMovement(
    inventoryId: string,
    ownerType: InventoryOwnerType,
    productId: string,
    type: InventoryMovementType,
    quantity: number,
    createdBy: string | null,
    referenceType: InventoryReferenceType,
    referenceId: string | undefined,
    note: string | undefined,
    tx: any,
  ) {
    return tx.stockMovement.create({
      data: {
        inventoryId,
        ownerType,
        productId,
        type,
        quantity,
        referenceType,
        referenceId,
        note,
        createdBy,
      },
    });
  }

  private async resolveOwner(
    userId: string,
    role: UserRole,
  ): Promise<InventoryOwner> {
    if (role === UserRole.company) {
      const profile = await this.prisma.companyProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!profile) throw new NotFoundException("Company profile not found");
      return { ownerType: InventoryOwnerType.company, ownerId: profile.id };
    }

    if (role === UserRole.distributor) {
      const profile = await this.prisma.distributorProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!profile)
        throw new NotFoundException("Distributor profile not found");
      return { ownerType: InventoryOwnerType.distributor, ownerId: profile.id };
    }

    if (role === UserRole.pharmacist) {
      const profile = await this.prisma.pharmacistProfile.findUnique({
        where: { userId },
        select: { id: true },
      });
      if (!profile) throw new NotFoundException("Pharmacist profile not found");
      return { ownerType: InventoryOwnerType.pharmacist, ownerId: profile.id };
    }

    throw new ForbiddenException();
  }

  private async validateProductAccess(
    owner: InventoryOwner,
    productId: string,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, companyId: true },
    });
    if (!product) throw new NotFoundException("Product not found");

    if (
      owner.ownerType === InventoryOwnerType.company &&
      product.companyId !== owner.ownerId
    ) {
      throw new BadRequestException("Product does not belong to this company");
    }

    if (owner.ownerType === InventoryOwnerType.distributor) {
      const linked = await this.prisma.companyDistributor.findFirst({
        where: {
          distributorId: owner.ownerId,
          companyId: product.companyId,
          status: "active",
        },
      });
      if (!linked)
        throw new BadRequestException(
          "Distributor is not linked to this product company",
        );
    }
  }

  private validateFreeQuantityOwner(
    owner: InventoryOwner,
    freeQuantity?: number,
  ) {
    if (freeQuantity === undefined) return;
    if (owner.ownerType !== InventoryOwnerType.company) {
      throw new BadRequestException(
        "Free sample quantity can only be managed by company inventory",
      );
    }
  }

  private ownerData(owner: InventoryOwner) {
    if (owner.ownerType === InventoryOwnerType.company)
      return { companyId: owner.ownerId };
    if (owner.ownerType === InventoryOwnerType.distributor)
      return { distributorId: owner.ownerId };
    return { pharmacistId: owner.ownerId };
  }

  private ownerWhere(owner: InventoryOwner) {
    if (owner.ownerType === InventoryOwnerType.company)
      return { companyId: owner.ownerId };
    if (owner.ownerType === InventoryOwnerType.distributor)
      return { distributorId: owner.ownerId };
    return { pharmacistId: owner.ownerId };
  }

  private ownerProductUnique(owner: InventoryOwner, productId: string) {
    if (owner.ownerType === InventoryOwnerType.company) {
      return { companyId_productId: { companyId: owner.ownerId, productId } };
    }
    if (owner.ownerType === InventoryOwnerType.distributor) {
      return {
        distributorId_productId: { distributorId: owner.ownerId, productId },
      };
    }
    return {
      pharmacistId_productId: { pharmacistId: owner.ownerId, productId },
    };
  }
}
