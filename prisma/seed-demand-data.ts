/**
 * Generates realistic-but-synthetic weekly order history so the demand
 * forecasting model (see src/forecasting/) has something to train on.
 * Always creates/reuses its own dedicated synthetic company, distributors,
 * and pharmacists (tagged @teryaq.local emails) — never touches or borrows
 * real accounts, no matter how many already exist. Safe to re-run: it's
 * idempotent per tagged email. All synthetic orders are additionally tagged
 * with SYNTHETIC_TAG in Order.notes so they stay identifiable/removable later.
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

/** Deterministic, collision-free placeholder phone per synthetic account. */
function syntheticPhone(roleCode: string, index: number): string {
  return `099${roleCode}${String(index).padStart(4, '0')}`;
}

function placeholderAvatar(label: string): string {
  return `https://placehold.co/200x200?text=${encodeURIComponent(label)}`;
}

function placeholderDoc(label: string): string {
  return `https://placehold.co/600x800?text=${encodeURIComponent(label)}`;
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

const SYNTHETIC_COMPANY_EMAIL = 'synthetic-company@teryaq.local';

async function ensureCompanyWithProducts(cityId: string): Promise<{ companyId: string; productIds: string[] }> {
  // Always the same dedicated synthetic company (looked up by its tagged email),
  // never a real one picked up via findFirst — keeps synthetic data fully isolated.
  const existingUser = await prisma.user.findUnique({ where: { email: SYNTHETIC_COMPANY_EMAIL } });
  let company = existingUser
    ? await prisma.companyProfile.findUnique({ where: { userId: existingUser.id } })
    : null;

  if (!company) {
    const user = await prisma.user.create({
      data: {
        email: SYNTHETIC_COMPANY_EMAIL,
        passwordHash: await hashTestPassword(),
        role: UserRole.company,
        status: UserStatus.active,
        fullName: 'Synthetic Pharma Co.',
        phone: syntheticPhone('0', 1),
        avatarUrl: placeholderAvatar('Synthetic Pharma Co.'),
        emailVerifiedAt: new Date(),
        cityId,
      },
    });
    company = await prisma.companyProfile.create({
      data: {
        userId: user.id,
        companyName: 'Teryaq Synthetic Pharma',
        commercialRegNo: 'SYN-REG-0001',
        healthMinistryLicense: 'SYN-LIC-0001',
        logoUrl: placeholderAvatar('Teryaq Synthetic Pharma'),
        website: 'https://synthetic-pharma.teryaq.local',
        description: 'شركة أدوية تجريبية تستخدم لتوليد بيانات اختبار نموذج التنبؤ بالطلب.',
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
        usageInstructions: 'يستخدم حسب إرشادات الطبيب أو الصيدلي. منتج تجريبي لأغراض الاختبار.',
        companyToDistributorPrice: 1.5,
        distributorToPharmacistPrice: 2.5,
        pharmacistToConsumerPrice: 4,
        imageUrl: placeholderAvatar(variant > 1 ? `${baseName} ${variant}` : baseName),
        status: ProductStatus.active,
      },
    });
    productIds.push(product.id);
  }
  if (toCreate > 0) console.log(`Created ${toCreate} synthetic products`);

  return { companyId: company.id, productIds };
}

/**
 * Creates (or reuses, on re-run) exactly `count` dedicated synthetic distributor
 * accounts, looked up by their tagged email — never touches/counts real distributors,
 * so synthetic data always lives on its own accounts regardless of what already exists.
 */
async function ensureDistributors(cityId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  let created = 0;

  for (let i = 1; i <= count; i++) {
    const email = `synthetic-distributor-${i}@teryaq.local`;
    let user = await prisma.user.findUnique({ where: { email } });
    let distributor = user
      ? await prisma.distributorProfile.findUnique({ where: { userId: user.id } })
      : null;

    if (!distributor) {
      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            passwordHash: await hashTestPassword(),
            role: UserRole.distributor,
            status: UserStatus.active,
            fullName: `Synthetic Distributor ${i}`,
            phone: syntheticPhone('1', i),
            avatarUrl: placeholderAvatar(`Distributor ${i}`),
            emailVerifiedAt: new Date(),
            cityId,
          },
        });
      }
      distributor = await prisma.distributorProfile.create({
        data: {
          userId: user.id,
          companyName: `Synthetic Distribution ${i}`,
          licenseDocUrl: placeholderDoc(`Distributor License ${i}`),
          verifiedAt: new Date(),
        },
      });
      created++;
    }
    ids.push(distributor.id);
  }
  if (created > 0) console.log(`Created ${created} synthetic distributors`);
  return ids;
}

/**
 * Same idea as ensureDistributors: exactly `count` dedicated synthetic pharmacist
 * accounts, looked up/created by tagged email, isolated from real pharmacists.
 */
async function ensurePharmacists(cityId: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  let created = 0;

  for (let i = 1; i <= count; i++) {
    const email = `synthetic-pharmacist-${i}@teryaq.local`;
    let user = await prisma.user.findUnique({ where: { email } });
    let pharmacist = user
      ? await prisma.pharmacistProfile.findUnique({ where: { userId: user.id } })
      : null;

    if (!pharmacist) {
      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            passwordHash: await hashTestPassword(),
            role: UserRole.pharmacist,
            status: UserStatus.active,
            fullName: `Synthetic Pharmacist ${i}`,
            phone: syntheticPhone('2', i),
            avatarUrl: placeholderAvatar(`Pharmacist ${i}`),
            emailVerifiedAt: new Date(),
            cityId,
          },
        });
      }
      pharmacist = await prisma.pharmacistProfile.create({
        data: {
          userId: user.id,
          pharmacyLicenseNo: `SYN-PH-${i}-${Date.now()}`,
          pharmacyName: `Synthetic Pharmacy ${i}`,
          commercialRegNo: `SYN-PH-CR-${i}`,
          address: 'Synthetic Street 1, Damascus',
          licenseDocUrl: placeholderDoc(`Pharmacy License ${i}`),
          verifiedAt: new Date(),
        },
      });
      created++;
    }
    ids.push(pharmacist.id);
  }
  if (created > 0) console.log(`Created ${created} synthetic pharmacists`);
  return ids;
}

async function ensureCompanyInventory(companyId: string, productIds: string[]) {
  let created = 0;
  for (const productId of productIds) {
    const existing = await prisma.inventory.findUnique({
      where: { companyId_productId: { companyId, productId } },
    });
    if (!existing) {
      await prisma.inventory.create({
        data: {
          ownerType: InventoryOwnerType.company,
          companyId,
          productId,
          quantityAvailable: randInt(1000, 5000),
          freeQuantity: randInt(20, 100),
          lowStockThreshold: 200,
        },
      });
      created++;
    }
  }
  if (created > 0) console.log(`Created ${created} company inventory rows`);
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
  const { companyId, productIds } = await ensureCompanyWithProducts(cityId);
  const distributorIds = await ensureDistributors(cityId, MIN_DISTRIBUTORS);
  const pharmacistIds = await ensurePharmacists(cityId, MIN_PHARMACISTS);

  await ensureCompanyInventory(companyId, productIds);
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
  console.log(`\nSynthetic login accounts (password for all: ${TEST_PASSWORD}):`);
  console.log(`  Company:     ${SYNTHETIC_COMPANY_EMAIL}`);
  for (let i = 1; i <= MIN_DISTRIBUTORS; i++) {
    console.log(`  Distributor: synthetic-distributor-${i}@teryaq.local`);
  }
  for (let i = 1; i <= MIN_PHARMACISTS; i++) {
    console.log(`  Pharmacist:  synthetic-pharmacist-${i}@teryaq.local`);
  }
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
