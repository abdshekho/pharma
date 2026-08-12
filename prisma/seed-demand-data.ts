/**
 * Generates realistic-but-synthetic weekly order history so the demand
 * forecasting model (see src/forecasting/) has something to train on.
 * Safe to run on a fresh database: creates the minimum supporting entities
 * (company/products/distributors/pharmacists) if too few already exist.
 * All synthetic rows are tagged with SYNTHETIC_TAG in Order.notes so they
 * stay identifiable/removable later.
 *
 * Run: npm run seed:demand
 */
import {
  PrismaClient,
  UserRole,
  UserStatus,
  ProductStatus,
  OrderStatus,
  PaymentMethod,
  InventoryOwnerType,
  DosageForm,
  PackUnit,
  PackageType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const SYNTHETIC_TAG = '[synthetic-seed]';
const TEST_PASSWORD = 'Password123!';
const WEEKS_OF_HISTORY = 52;
const MIN_DISTRIBUTORS = 2;
const MIN_PHARMACISTS = 3;
const MIN_ACTIVE_PRODUCTS = 8;

const PRODUCT_NAMES_AR = [
  'باراسيتامول',
  'أموكسيسيلين',
  'إيبوبروفين',
  'أوميبرازول',
  'أزيثروميسين',
  'سيتريزين',
  'ميتفورمين',
  'أتورفاستاتين',
  'لوراتادين',
  'فيتامين سي',
];

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gaussianNoise(): number {
  const u1 = Math.random() || 1e-9;
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function randomOrderNumber(): string {
  return `SYN-${crypto.randomBytes(6).toString('hex')}`;
}

async function hashTestPassword(): Promise<string> {
  return bcrypt.hash(TEST_PASSWORD, 10);
}

async function ensureCity(): Promise<string> {
  const existing = await prisma.city.findFirst();
  if (existing) return existing.id;
  const city = await prisma.city.create({
    data: { nameAr: 'دمشق', nameEn: 'Damascus', countryCode: 'DAM', isActive: true },
  });
  console.log(`Created city: ${city.nameAr}`);
  return city.id;
}

async function ensureCompanyWithProducts(cityId: string): Promise<{ companyId: string; productIds: string[] }> {
  let company = await prisma.companyProfile.findFirst();
  if (!company) {
    const user = await prisma.user.create({
      data: {
        email: 'synthetic-company@teryaq.local',
        passwordHash: await hashTestPassword(),
        role: UserRole.company,
        status: UserStatus.active,
        fullName: 'Synthetic Pharma Co.',
        cityId,
      },
    });
    company = await prisma.companyProfile.create({
      data: {
        userId: user.id,
        companyName: 'Teryaq Synthetic Pharma',
        commercialRegNo: 'SYN-REG-0001',
        healthMinistryLicense: 'SYN-LIC-0001',
        verifiedAt: new Date(),
      },
    });
    console.log(`Created company: ${company.companyName}`);
  }

  const existingProducts = await prisma.product.findMany({
    where: { companyId: company.id, status: ProductStatus.active },
    select: { id: true },
  });
  const productIds = existingProducts.map((p) => p.id);

  const toCreate = MIN_ACTIVE_PRODUCTS - productIds.length;
  for (let i = 0; i < toCreate; i++) {
    const idx = productIds.length + i;
    const baseName = PRODUCT_NAMES_AR[idx % PRODUCT_NAMES_AR.length];
    const variant = Math.floor(idx / PRODUCT_NAMES_AR.length) + 1;
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        nameAr: variant > 1 ? `${baseName} ${variant}` : baseName,
        nameEn: `Synthetic Product ${idx + 1}`,
        dosageForm: DosageForm.tablet,
        packSize: 20,
        packUnit: PackUnit.tablet,
        packageType: PackageType.box,
        strength: '500mg',
        companyToDistributorPrice: 1.5,
        distributorToPharmacistPrice: 2.5,
        pharmacistToConsumerPrice: 4,
        status: ProductStatus.active,
      },
    });
    productIds.push(product.id);
  }
  if (toCreate > 0) console.log(`Created ${toCreate} synthetic products`);

  return { companyId: company.id, productIds };
}

async function ensureDistributors(cityId: string): Promise<string[]> {
  const existing = await prisma.distributorProfile.findMany({ select: { id: true } });
  const ids = existing.map((d) => d.id);

  for (let i = ids.length; i < MIN_DISTRIBUTORS; i++) {
    const user = await prisma.user.create({
      data: {
        email: `synthetic-distributor-${i + 1}@teryaq.local`,
        passwordHash: await hashTestPassword(),
        role: UserRole.distributor,
        status: UserStatus.active,
        fullName: `Synthetic Distributor ${i + 1}`,
        cityId,
      },
    });
    const distributor = await prisma.distributorProfile.create({
      data: { userId: user.id, companyName: `Synthetic Distribution ${i + 1}`, verifiedAt: new Date() },
    });
    ids.push(distributor.id);
  }
  if (ids.length > existing.length) console.log(`Created ${ids.length - existing.length} synthetic distributors`);
  return ids;
}

async function ensurePharmacists(cityId: string): Promise<string[]> {
  const existing = await prisma.pharmacistProfile.findMany({ select: { id: true } });
  const ids = existing.map((p) => p.id);

  for (let i = ids.length; i < MIN_PHARMACISTS; i++) {
    const user = await prisma.user.create({
      data: {
        email: `synthetic-pharmacist-${i + 1}@teryaq.local`,
        passwordHash: await hashTestPassword(),
        role: UserRole.pharmacist,
        status: UserStatus.active,
        fullName: `Synthetic Pharmacist ${i + 1}`,
        cityId,
      },
    });
    const pharmacist = await prisma.pharmacistProfile.create({
      data: {
        userId: user.id,
        pharmacyLicenseNo: `SYN-PH-${i + 1}-${Date.now()}`,
        pharmacyName: `Synthetic Pharmacy ${i + 1}`,
        address: 'Synthetic Street 1, Damascus',
        verifiedAt: new Date(),
      },
    });
    ids.push(pharmacist.id);
  }
  if (ids.length > existing.length) console.log(`Created ${ids.length - existing.length} synthetic pharmacists`);
  return ids;
}

async function ensureDistributorInventory(distributorIds: string[], productIds: string[]) {
  let created = 0;
  for (const distributorId of distributorIds) {
    for (const productId of productIds) {
      const existing = await prisma.inventory.findUnique({
        where: { distributorId_productId: { distributorId, productId } },
      });
      if (!existing) {
        await prisma.inventory.create({
          data: {
            ownerType: InventoryOwnerType.distributor,
            distributorId,
            productId,
            quantityAvailable: randInt(200, 1000),
            freeQuantity: randInt(5, 20),
            lowStockThreshold: 50,
          },
        });
        created++;
      }
    }
  }
  if (created > 0) console.log(`Created ${created} distributor inventory rows`);
}

async function ensurePharmacistInventory(pharmacistId: string, productIds: string[]) {
  for (const productId of productIds) {
    const existing = await prisma.inventory.findUnique({
      where: { pharmacistId_productId: { pharmacistId, productId } },
    });
    if (!existing) {
      // Deliberately low/varied stock so reorder suggestions have something to say.
      await prisma.inventory.create({
        data: {
          ownerType: InventoryOwnerType.pharmacist,
          pharmacistId,
          productId,
          quantityAvailable: randInt(0, 40),
          freeQuantity: 0,
          lowStockThreshold: 15,
        },
      });
    }
  }
}

interface WeeklyOrderLine {
  productId: string;
  quantity: number;
}

/** base + linear trend + weekly seasonality + noise + occasional promo spike. */
function generateWeeklyQuantity(week: number, base: number, trendPerWeek: number, seasonalAmplitude: number): number {
  const trend = trendPerWeek * week;
  const seasonal = seasonalAmplitude * Math.sin((2 * Math.PI * week) / 52);
  const noise = gaussianNoise() * (base * 0.15);
  const promoBoost = Math.random() < 0.04 ? base * 1.5 : 0;
  return Math.max(0, Math.round(base + trend + seasonal + noise + promoBoost));
}

/**
 * Generates `weeksBack` weeks of orders (oldest → newest, ending "now") for one
 * pharmacist buying a fixed subset of products from one distributor. Weeks with
 * quantity 0 for every product simply produce no Order — the dense-weekly-series
 * zero-fill in week-utils.ts reconstructs the gap as 0 at training/inference time.
 */
async function generatePharmacistHistory(
  pharmacistId: string,
  distributorId: string,
  cityId: string,
  deliveryAddress: string,
  products: { productId: string; base: number; trendPerWeek: number; seasonalAmplitude: number }[],
  weeksBack: number,
) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  let ordersCreated = 0;
  let itemsCreated = 0;

  for (let week = WEEKS_OF_HISTORY - weeksBack; week < WEEKS_OF_HISTORY; week++) {
    const lines: WeeklyOrderLine[] = [];
    for (const p of products) {
      const qty = generateWeeklyQuantity(week, p.base, p.trendPerWeek, p.seasonalAmplitude);
      if (qty > 0) lines.push({ productId: p.productId, quantity: qty });
    }
    if (lines.length === 0) continue;

    const weeksFromNow = WEEKS_OF_HISTORY - week;
    const weekStart = now - weeksFromNow * weekMs;
    const createdAt = new Date(weekStart + randInt(0, 4) * 24 * 60 * 60 * 1000);
    const deliveredAt = new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000);

    const order = await prisma.order.create({
      data: {
        orderNumber: randomOrderNumber(),
        pharmacistId,
        distributorId,
        cityId,
        status: OrderStatus.delivered,
        totalAmount: lines.reduce((sum, l) => sum + l.quantity * 2.5, 0),
        paymentMethod: PaymentMethod.cod,
        deliveryAddress,
        notes: SYNTHETIC_TAG,
        approvedAt: createdAt,
        deliveredAt,
        createdAt,
      },
    });
    ordersCreated++;

    for (const line of lines) {
      await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: 2.5,
          subtotal: line.quantity * 2.5,
        },
      });
      itemsCreated++;
    }
  }

  return { ordersCreated, itemsCreated };
}

function pickRandomSubset<T>(arr: T[], size: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(size, arr.length));
}

async function main() {
  console.log('Seeding synthetic demand data...\n');

  const cityId = await ensureCity();
  const { productIds } = await ensureCompanyWithProducts(cityId);
  const distributorIds = await ensureDistributors(cityId);
  const pharmacistIds = await ensurePharmacists(cityId);

  await ensureDistributorInventory(distributorIds, productIds);

  let totalOrders = 0;
  let totalItems = 0;

  for (let i = 0; i < pharmacistIds.length; i++) {
    const pharmacistId = pharmacistIds[i];
    const distributorId = distributorIds[i % distributorIds.length]; // one primary distributor per pharmacist

    await ensurePharmacistInventory(pharmacistId, productIds);

    const regularProducts = pickRandomSubset(productIds, randInt(4, 6)).map((productId) => ({
      productId,
      base: randInt(5, 50),
      trendPerWeek: (Math.random() - 0.4) * 0.5, // slight growth or decline
      seasonalAmplitude: randInt(2, 10),
    }));

    const { ordersCreated, itemsCreated } = await generatePharmacistHistory(
      pharmacistId,
      distributorId,
      cityId,
      'Synthetic Street 1, Damascus',
      regularProducts,
      WEEKS_OF_HISTORY,
    );
    totalOrders += ordersCreated;
    totalItems += itemsCreated;

    // One extra "new product" with only 3 weeks of history, to exercise the
    // INSUFFICIENT_HISTORY path in reorder suggestions (see reorder.service.ts).
    const newProductCandidates = productIds.filter((id) => !regularProducts.some((p) => p.productId === id));
    if (newProductCandidates.length > 0) {
      const newProduct = { productId: newProductCandidates[0], base: randInt(5, 20), trendPerWeek: 0, seasonalAmplitude: 2 };
      const { ordersCreated: newOrders, itemsCreated: newItems } = await generatePharmacistHistory(
        pharmacistId,
        distributorId,
        cityId,
        'Synthetic Street 1, Damascus',
        [newProduct],
        3,
      );
      totalOrders += newOrders;
      totalItems += newItems;
    }

    console.log(`Pharmacist ${i + 1}/${pharmacistIds.length}: ${ordersCreated} orders, ${itemsCreated} items generated`);
  }

  console.log(`\nDone. Total: ${totalOrders} synthetic orders, ${totalItems} order items.`);
  console.log(`Test login password for any synthetic account: ${TEST_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
