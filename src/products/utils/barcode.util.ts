import { randomBytes } from 'crypto';

/**
 * Utility functions for barcode generation and validation
 */
export class BarcodeUtil {
  /**
   * Generate a random barcode (12 digits by default, compatible with EAN-12)
   */
  static generateRandomBarcode(length: number = 12): string {
    const randomNum = randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length)
      .toUpperCase();
    
    // Ensure it's all digits (if not, convert letters to digits)
    return randomNum.replace(/[A-F]/g, (char) => 
      (char.charCodeAt(0) - 55).toString() // Convert A-F to 0-5
    ).padStart(length, '0').slice(0, length);
  }

  /**
   * Generate barcode from product information
   */
  static generateBarcodeFromProduct(
    companyPrefix: string,
    productId: string,
    length: number = 12
  ): string {
    // Simple concatenation with padding
    const base = `${companyPrefix}${productId}`.replace(/\D/g, '');
    return base.padEnd(length, '0').slice(0, length);
  }

  /**
   * Validate barcode format (basic validation)
   */
  static isValidBarcode(barcode: string): boolean {
    if (!barcode || barcode.length < 8 || barcode.length > 13) {
      return false;
    }
    
    // Check if it contains only digits
    return /^\d+$/.test(barcode);
  }

  /**
   * Calculate check digit for EAN-13 barcode
   */
  static calculateEAN13CheckDigit(code: string): string {
    if (code.length !== 12) {
      throw new Error('Code must be 12 digits for EAN-13');
    }

    let sum = 0;
    for (let i = 0; i < 12; i++) {
      const digit = parseInt(code[i]);
      sum += (i % 2 === 0) ? digit : digit * 3;
    }
    
    const checkDigit = (10 - (sum % 10)) % 10;
    return checkDigit.toString();
  }

  /**
   * Generate valid EAN-13 barcode
   */
  static generateEAN13(): string {
    const baseCode = this.generateRandomBarcode(12);
    const checkDigit = this.calculateEAN13CheckDigit(baseCode);
    return baseCode + checkDigit;
  }
}