import { PriceType, UserRole } from '@prisma/client';

/**
 * Get price type based on user role
 */
export function getPriceTypeForRole(role: UserRole): PriceType | null {
  switch (role) {
    case UserRole.company:
      return PriceType.company_to_distributor;
    case UserRole.distributor:
      return PriceType.distributor_to_pharmacist;
    case UserRole.pharmacist:
      return PriceType.pharmacist_to_consumer;
    case UserRole.admin:
      // Admin can see all prices
      return null;
    case UserRole.doctor:
    case UserRole.representative:
      // Doctors and representatives typically see consumer prices
      return PriceType.pharmacist_to_consumer;
    default:
      return PriceType.pharmacist_to_consumer;
  }
}

/**
 * Get readable price type name
 */
export function getPriceTypeName(priceType: PriceType): string {
  switch (priceType) {
    case PriceType.company_to_distributor:
      return 'Company to Distributor';
    case PriceType.distributor_to_pharmacist:
      return 'Distributor to Pharmacist';
    case PriceType.pharmacist_to_consumer:
      return 'Pharmacist to Consumer';
    default:
      return 'Unknown';
  }
}

/**
 * Get price type based on user role for product creation/update
 */
export function getPriceTypeForRoleForCreation(role: UserRole): PriceType {
  switch (role) {
    case UserRole.company:
      return PriceType.company_to_distributor;
    case UserRole.distributor:
      return PriceType.distributor_to_pharmacist;
    default:
      // Only company and distributor can set prices
      return PriceType.company_to_distributor;
  }
}