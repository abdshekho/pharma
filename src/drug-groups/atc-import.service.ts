import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as XLSX from 'xlsx';
interface AtcRecord {
  'ATC code_L1': string;
  'name_L1': string;
  'namear_L1': string;
  'ATC code_L2': string;
  'name_L2': string;
  'namear_L2': string;
  'ATC code_L3': string;
  'name_L3': string;
  'namear_L3': string;
  'ATC code_L4': string;
  'name_L4': string;
  'namear_L4': string;
  'ATC code_L5': string;
  'Name_L5': string;
  'Namear_L5': string;
  'DDD_L5': string;
  'U_L5': string;
  'Adm.R_L5': string;
  'Note_L5': string;
  'flag_DDD': string;
}

@Injectable()
export class AtcImportService {
  private readonly logger = new Logger(AtcImportService.name);

  constructor(private prisma: PrismaService) {}

  async importFromExcel(filePath: string): Promise<{ success: boolean; message: string; stats: any }> {
    try {
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        throw new BadRequestException(`File not found: ${filePath}`);
      }

      this.logger.log(`Starting ATC import from: ${filePath}`);
      
      // Read Excel file
      const workbook = XLSX.readFile(filePath);
      
      // Get first sheet
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      // Convert to JSON with headers
      const data = XLSX.utils.sheet_to_json(worksheet);
      
      if (data.length === 0) {
        throw new BadRequestException('File is empty or has no data');
      }

      this.logger.log(`Found ${data.length} records in Excel file`);

      // Parse data rows
      const records: AtcRecord[] = [];
      for (const row of data as any[]) {
        const record: any = {};
        
        // Map Excel row to AtcRecord
        Object.keys(row).forEach(key => {
          const value = row[key];
          record[key] = value !== undefined && value !== null ? String(value).trim() : '';
        });
        
        // Debug: log Arabic fields from first record
        if (records.length === 0) {
          this.logger.log(`First record Arabic fields:`);
          this.logger.log(`  namear_L1: "${record['namear_L1']}"`);
          this.logger.log(`  namear_L2: "${record['namear_L2']}"`);
          this.logger.log(`  namear_L3: "${record['namear_L3']}"`);
          this.logger.log(`  namear_L4: "${record['namear_L4']}"`);
          this.logger.log(`  Namear_L5: "${record['Namear_L5']}"`);
        }
        
        records.push(record as AtcRecord);
      }

      this.logger.log(`Parsed ${records.length} records`);

      // Process records and create drug groups
      const stats = await this.processAtcRecords(records);
      
      return {
        success: true,
        message: `Successfully imported ${records.length} ATC records`,
        stats
      };

    } catch (error) {
      this.logger.error(`Error importing ATC data: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to import ATC data: ${error.message}`);
    }
  }

  private async processAtcRecords(records: AtcRecord[]): Promise<any> {
    this.logger.log(`Processing ${records.length} ATC records`);
    
    const stats = {
      drugGroupsCreated: 0,
      categoriesCreated: 0,
      drugGroupCategoriesLinked: 0,
      levels: {
        l1: new Set<string>(),
        l2: new Set<string>(),
        l3: new Set<string>(),
        l4: new Set<string>(),
        l5: new Set<string>(),
      }
    };

    try {
      // First, create categories for each ATC level
      const categoryMap = new Map<string, string>(); // Map ATC code -> category ID
      
      for (const record of records) {
        // Track unique codes at each level
        if (record['ATC code_L1']) stats.levels.l1.add(record['ATC code_L1']);
        if (record['ATC code_L2']) stats.levels.l2.add(record['ATC code_L2']);
        if (record['ATC code_L3']) stats.levels.l3.add(record['ATC code_L3']);
        if (record['ATC code_L4']) stats.levels.l4.add(record['ATC code_L4']);
        if (record['ATC code_L5']) stats.levels.l5.add(record['ATC code_L5']);
      }
      
      this.logger.log(`Unique codes found: L1=${stats.levels.l1.size}, L2=${stats.levels.l2.size}, L3=${stats.levels.l3.size}, L4=${stats.levels.l4.size}, L5=${stats.levels.l5.size}`);

    // Create categories for L1 (Anatomical Main Group)
    this.logger.log(`Creating ${stats.levels.l1.size} L1 categories`);
    for (const atcCode of stats.levels.l1) {
      const categoryNames = this.getLevel1Name(atcCode, records);
      const categoryCode = atcCode; // L1 code only
      this.logger.log(`Creating L1 category: ${categoryCode} -> Arabic: ${categoryNames.arabic}, English: ${categoryNames.english}`);
      const category = await this.findOrCreateCategory(categoryCode, categoryNames.arabic, categoryNames.english, null);
      categoryMap.set(atcCode, category.id);
      stats.categoriesCreated++;
      this.logger.log(`Created category with ID: ${category.id}`);
    }

    // Create categories for L2 (Therapeutic Subgroup)
    for (const atcCode of stats.levels.l2) {
      const parentCode = atcCode.substring(0, 1); // Get L1 code
      const parentId = categoryMap.get(parentCode);
      const categoryNames = this.getLevel2Name(atcCode, records);
      const categoryCode = atcCode; // L2 code only
      const category = await this.findOrCreateCategory(categoryCode, categoryNames.arabic, categoryNames.english, parentId);
      categoryMap.set(atcCode, category.id);
      stats.categoriesCreated++;
    }

    // Create categories for L3 (Pharmacological Subgroup)
    for (const atcCode of stats.levels.l3) {
      const parentCode = atcCode.substring(0, 3); // Get L2 code
      const parentId = categoryMap.get(parentCode);
      const categoryNames = this.getLevel3Name(atcCode, records);
      const categoryCode = atcCode; // L3 code only
      const category = await this.findOrCreateCategory(categoryCode, categoryNames.arabic, categoryNames.english, parentId);
      categoryMap.set(atcCode, category.id);
      stats.categoriesCreated++;
    }

    // Create categories for L4 (Chemical Subgroup)
    for (const atcCode of stats.levels.l4) {
      const parentCode = atcCode.substring(0, 4); // Get L3 code (A01A -> A01)
      const parentId = categoryMap.get(parentCode);
      const categoryNames = this.getLevel4Name(atcCode, records);
      const categoryCode = atcCode; // L4 code only
      const category = await this.findOrCreateCategory(categoryCode, categoryNames.arabic, categoryNames.english, parentId);
      categoryMap.set(atcCode, category.id);
      stats.categoriesCreated++;
    }

    // Create drug groups from L5 (Chemical Substance)
    this.logger.log(`Creating drug groups from ${records.length} records`);
    for (const record of records) {
      if (record['ATC code_L5'] && record['Name_L5']) {
        // Use L5 as drug group
        const drugGroupCode = record['ATC code_L5']; // L5 code only
        const drugGroupNames = this.getDrugGroupName(record);
        const description = this.buildDescription(record);
        
        this.logger.log(`Creating drug group: ${drugGroupCode} -> Arabic: ${drugGroupNames.arabic}, English: ${drugGroupNames.english}`);
        const drugGroup = await this.findOrCreateDrugGroup(drugGroupCode, drugGroupNames.arabic, drugGroupNames.english, description);
        stats.drugGroupsCreated++;
        this.logger.log(`Created drug group with ID: ${drugGroup.id}`);

        // Link to L4 category
        const categoryId = categoryMap.get(record['ATC code_L4']);
        if (categoryId) {
          this.logger.log(`Linking drug group ${drugGroup.id} to category ${categoryId}`);
          await this.linkDrugGroupToCategory(drugGroup.id, categoryId);
          stats.drugGroupCategoriesLinked++;
        } else {
          this.logger.warn(`No category found for L4 code: ${record['ATC code_L4']}`);
        }
      } else {
        this.logger.warn(`Record missing L5 code or name: ${JSON.stringify(record)}`);
      }
    }

      return {
        ...stats,
        levels: {
          l1: stats.levels.l1.size,
          l2: stats.levels.l2.size,
          l3: stats.levels.l3.size,
          l4: stats.levels.l4.size,
          l5: stats.levels.l5.size,
        }
      };
    } catch (error) {
      this.logger.error(`Error in processAtcRecords: ${error.message}`, error.stack);
      throw error;
    }
  }

  private getLevel1Name(atcCode: string, records: AtcRecord[]): { arabic: string; english: string } {
    // Find the record with this L1 code to get the name
    const record = records.find(r => r['ATC code_L1'] === atcCode);
    const arabicName = record ? this.cleanArabicName(record['namear_L1']) : '';
    const englishName = record ? record['name_L1'] : '';
    
    // Use Arabic name if available and not empty, otherwise use English in Arabic field
    const finalArabic = arabicName && arabicName.trim() ? arabicName : 
                       englishName ? englishName : 
                       `المستوى الأول: ${atcCode}`;
    
    const finalEnglish = englishName && englishName.trim() ? englishName : 
                        arabicName && arabicName.trim() ? arabicName : 
                        `Level 1: ${atcCode}`;
    
    // Truncate to fit in 100 characters
    return {
      arabic: finalArabic.length > 100 ? finalArabic.substring(0, 97) + '...' : finalArabic.trim(),
      english: finalEnglish.length > 100 ? finalEnglish.substring(0, 97) + '...' : finalEnglish.trim()
    };
  }

  private getLevel2Name(atcCode: string, records: AtcRecord[]): { arabic: string; english: string } {
    // Find the record with this L2 code to get the name
    const record = records.find(r => r['ATC code_L2'] === atcCode);
    const arabicName = record ? this.cleanArabicName(record['namear_L2']) : '';
    const englishName = record ? record['name_L2'] : '';
    
    // Use Arabic name if available and not empty, otherwise use English in Arabic field
    const finalArabic = arabicName && arabicName.trim() ? arabicName : 
                       englishName ? englishName : 
                       `المستوى الثاني: ${atcCode}`;
    
    const finalEnglish = englishName && englishName.trim() ? englishName : 
                        arabicName && arabicName.trim() ? arabicName : 
                        `Level 2: ${atcCode}`;
    
    // Truncate to fit in 100 characters
    return {
      arabic: finalArabic.length > 100 ? finalArabic.substring(0, 97) + '...' : finalArabic.trim(),
      english: finalEnglish.length > 100 ? finalEnglish.substring(0, 97) + '...' : finalEnglish.trim()
    };
  }

  private getLevel3Name(atcCode: string, records: AtcRecord[]): { arabic: string; english: string } {
    // Find the record with this L3 code to get the name
    const record = records.find(r => r['ATC code_L3'] === atcCode);
    const arabicName = record ? this.cleanArabicName(record['namear_L3']) : '';
    const englishName = record ? record['name_L3'] : '';
    
    // Use Arabic name if available and not empty, otherwise use English in Arabic field
    const finalArabic = arabicName && arabicName.trim() ? arabicName : 
                       englishName ? englishName : 
                       `المستوى الثالث: ${atcCode}`;
    
    const finalEnglish = englishName && englishName.trim() ? englishName : 
                        arabicName && arabicName.trim() ? arabicName : 
                        `Level 3: ${atcCode}`;
    
    // Truncate to fit in 100 characters
    return {
      arabic: finalArabic.length > 100 ? finalArabic.substring(0, 97) + '...' : finalArabic.trim(),
      english: finalEnglish.length > 100 ? finalEnglish.substring(0, 97) + '...' : finalEnglish.trim()
    };
  }

  private getLevel4Name(atcCode: string, records: AtcRecord[]): { arabic: string; english: string } {
    // Find the record with this L4 code to get the name
    const record = records.find(r => r['ATC code_L4'] === atcCode);
    const arabicName = record ? this.cleanArabicName(record['namear_L4']) : '';
    const englishName = record ? record['name_L4'] : '';
    
    // Use Arabic name if available and not empty, otherwise use English in Arabic field
    const finalArabic = arabicName && arabicName.trim() ? arabicName : 
                       englishName ? englishName : 
                       `المستوى الرابع: ${atcCode}`;
    
    const finalEnglish = englishName && englishName.trim() ? englishName : 
                        arabicName && arabicName.trim() ? arabicName : 
                        `Level 4: ${atcCode}`;
    
    // Truncate to fit in 100 characters
    return {
      arabic: finalArabic.length > 100 ? finalArabic.substring(0, 97) + '...' : finalArabic.trim(),
      english: finalEnglish.length > 100 ? finalEnglish.substring(0, 97) + '...' : finalEnglish.trim()
    };
  }

  private getDrugGroupName(record: AtcRecord): { arabic: string; english: string } {
    // Use L5 name for drug group
    const arabicName = this.cleanArabicName(record['Namear_L5']);
    const englishName = record['Name_L5'];
    
    // Use Arabic name if available and not empty, otherwise use English in Arabic field
    const finalArabic = arabicName && arabicName.trim() ? arabicName : 
                       englishName ? englishName : 
                       `المادة الفعالة: ${record['ATC code_L5']}`;
    
    const finalEnglish = englishName && englishName.trim() ? englishName : 
                        arabicName && arabicName.trim() ? arabicName : 
                        `Active Substance: ${record['ATC code_L5']}`;
    
    // Truncate to fit in 200 characters
    return {
      arabic: finalArabic.length > 200 ? finalArabic.substring(0, 197) + '...' : finalArabic.trim(),
      english: finalEnglish.length > 200 ? finalEnglish.substring(0, 197) + '...' : finalEnglish.trim()
    };
  }

  private cleanArabicName(name: string): string {
    if (!name) return '';
    // Remove extra spaces and clean the Arabic text
    return name.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
  }

  private buildDescription(record: AtcRecord): string {
    const parts: string[] = [];
    
    // if (record['ATC code_L5'] && record['Name_L5']) {
    //   parts.push(`المادة الكيميائية: ${record['Name_L5']} (${record['ATC code_L5']})`);
    // }
    
    if (record['DDD_L5']) {
      parts.push(`الجرعة اليومية المحددة: ${record['DDD_L5']} ${record['U_L5'] || ''}`);
    }
    
    if (record['Adm.R_L5']) {
      parts.push(`طريق الإعطاء: ${record['Adm.R_L5']}`);
    }
    
    if (record['Note_L5']) {
      parts.push(`ملاحظة: ${record['Note_L5']}`);
    }
    
    // if (record['href_L5']) {
    //   parts.push(`المرجع: ${record['href_L5']}`);
    // }
    
    return parts.join('\n');
  }

  private async findOrCreateCategory(code: string, nameAr: string, nameEn: string, parentId: string | null | undefined): Promise<any> {
    this.logger.debug(`Looking for category with code: ${code}`);
    
    // Try to find existing category by code
    const existing = await this.prisma.category.findFirst({
      where: { code }
    });

    if (existing) {
      this.logger.debug(`Found existing category: ${existing.id}`);
      return existing;
    }

    this.logger.debug(`Creating new category: ${code} -> Arabic: ${nameAr}, English: ${nameEn} with parentId: ${parentId || 'null'}`);
    
    // Create new category
    return this.prisma.category.create({
      data: {
        code,
        nameAr,
        nameEn,
        parentId: parentId || null,
        isActive: true
      }
    });
  }

  private async findOrCreateDrugGroup(code: string, nameAr: string, nameEn: string, description: string): Promise<any> {
    this.logger.debug(`Looking for drug group with code: ${code}`);
    
    // Try to find existing drug group by code
    const existing = await this.prisma.drugGroup.findFirst({
      where: { code }
    });

    if (existing) {
      this.logger.debug(`Found existing drug group: ${existing.id}`);
      return existing;
    }

    this.logger.debug(`Creating new drug group: ${code} -> Arabic: ${nameAr}, English: ${nameEn}`);
    
    // Create new drug group
    return this.prisma.drugGroup.create({
      data: {
        code,
        nameAr,
        nameEn,
        description: description,
        isActive: true
      }
    });
  }

  private async linkDrugGroupToCategory(drugGroupId: string, categoryId: string): Promise<void> {
    // Check if link already exists
    const existing = await this.prisma.drugGroupCategory.findFirst({
      where: {
        drugGroupId,
        categoryId
      }
    });

    if (!existing) {
      await this.prisma.drugGroupCategory.create({
        data: {
          drugGroupId,
          categoryId
        }
      });
    }
  }
}