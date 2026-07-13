import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PromotionLevel, ProductStatus } from '@prisma/client';
import puppeteer from 'puppeteer';
import { buildCatalogHtml, CatalogProductRow } from './catalog-pdf.template';

@Injectable()
export class DistributorCatalogService {
  constructor(private prisma: PrismaService) {}

  async generateCatalogPdf(userId: string): Promise<Buffer> {
    const distributor = await this.prisma.distributorProfile.findUnique({
      where: { userId },
      select: { id: true, companyName: true },
    });
    if (!distributor) throw new NotFoundException('Distributor profile not found');

    const inventories = await this.prisma.inventory.findMany({
      where: { distributorId: distributor.id, product: { status: ProductStatus.active } },
      include: {
        product: {
          select: {
            id: true,
            nameAr: true,
            distributorToPharmacistPrice: true,
            pharmacistToConsumerPrice: true,
            company: { select: { companyName: true } },
          },
        },
      },
    });

    const productIds = inventories.map((inv) => inv.productId);
    const now = new Date();

    const activePromotionWhere = {
      level: PromotionLevel.pharmacist,
      isActive: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
      OR: [{ distributorId: null }, { distributorId: distributor.id }],
    };

    const [percentageOffers, buyXGetYOffers] = await Promise.all([
      this.prisma.promotionProduct.findMany({
        where: { productId: { in: productIds }, promotion: activePromotionWhere },
        include: { promotion: true },
      }),
      this.prisma.promotionBuyXGetY.findMany({
        where: { buyProductId: { in: productIds }, promotion: activePromotionWhere },
        include: { promotion: true },
      }),
    ]);

    type Offer = { label: string; startsAt: Date; endsAt: Date };
    const offerByProductId = new Map<string, Offer>();

    for (const offer of percentageOffers) {
      offerByProductId.set(offer.productId, {
        label: `${Number(offer.discountPercent)}%`,
        startsAt: offer.promotion.startsAt,
        endsAt: offer.promotion.endsAt,
      });
    }
    for (const offer of buyXGetYOffers) {
      if (!offerByProductId.has(offer.buyProductId)) {
        offerByProductId.set(offer.buyProductId, {
          label: `${offer.buyQuantity} + ${offer.freeQuantity}`,
          startsAt: offer.promotion.startsAt,
          endsAt: offer.promotion.endsAt,
        });
      }
    }

    const rows: CatalogProductRow[] = inventories
      .map((inv): CatalogProductRow => {
        const offer = offerByProductId.get(inv.productId);
        return {
          nameAr: inv.product.nameAr,
          companyNameAr: inv.product.company.companyName,
          offerLabel: offer ? offer.label : '-',
          offerStartsAt: offer ? formatDate(offer.startsAt) : '-',
          offerEndsAt: offer ? formatDate(offer.endsAt) : '-',
          distributorToPharmacistPrice: formatPrice(inv.product.distributorToPharmacistPrice),
          pharmacistToConsumerPrice: formatPrice(inv.product.pharmacistToConsumerPrice),
          availability: inv.quantityAvailable > 0 ? 'Available' : 'Out of Stock',
        };
      })
      .sort((a, b) => a.nameAr.localeCompare(b.nameAr, 'ar'));

    const html = buildCatalogHtml({
      distributorName: distributor.companyName,
      generatedAt: formatDate(now),
      rows,
    });

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.evaluateHandle('document.fonts.ready');
      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}

function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

function formatPrice(value: unknown): string {
  return Number(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
