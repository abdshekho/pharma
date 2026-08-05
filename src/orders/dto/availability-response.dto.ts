export interface AvailabilityItemDto {
  productId: string;
  available: boolean;
  stock: number;
  promotions?: PromotionDto[];
}

export interface PromotionDto {
  id: string;
  promotionId? : string;
  type: 'percentage' | 'buyXgetY';
  title: string;
  description?: string | null;
  discountPercent?: number;
  buyXgetYDetails?: {
    buyProductId: string;
    buyQuantity: number;
    freeProductId: string;
    freeQuantity: number;
  };
}

export interface DistributorAvailabilityDto {
  distributorId: string;
  companyName: string;
  coverage: string;
  availableItems: AvailabilityItemDto[];
  promotions: PromotionDto[];
  canFulfill: boolean;
  status: 'full' | 'partial';
  missingProducts?: string[];
}

export interface CheckAvailabilityResponseDto {
  results: DistributorAvailabilityDto[];
}