import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as fs from 'fs';
import * as path from 'path';
import { ImportAtcDto } from './dto/import-atc.dto';

interface AtcRecord {
  'ATC code_L1': string;
  'ATC code_L2': string;
  'ATC code_L3': string;
  'name_L3': string;
  'ATC code_L4': string;
  'name_L4': string;
  'ATC code_L5': string;
  'Name_L5': string;
  'DDD_L5': string;
  'U_L5': string;
  'Adm.R_L5': string;
  'Note_L5': string;
  'href_L5': string;
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
      
      // Read the file as text
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      
      // Try different delimiters: tab, comma, semicolon
      const lines = fileContent.split(/\r?\n/).filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new BadRequestException('File is empty or has no data');
      }

      // Detect delimiter
      const firstLine = lines[0];
      let delimiter = '\t'; // default to tab
      
      if (firstLine.includes('\t')) {
        delimiter = '\t';
      } else if (firstLine.includes(',')) {
        delimiter = ',';
      } else if (firstLine.includes(';')) {
        delimiter = ';';
      }

      this.logger.log(`Detected delimiter: ${delimiter === '\t' ? 'tab' : delimiter}`);

      // Parse header
      const headers = firstLine.split(delimiter).map(h => h.trim());
      this.logger.log(`Found ${headers.length} headers`);

      // Parse data rows
      const records: AtcRecord[] = [];
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        // Simple CSV parsing (doesn't handle quoted fields with delimiters)
        const values = line.split(delimiter).map(v => v.trim());
        const record: any = {};
        
        headers.forEach((header, index) => {
          record[header] = values[index] || '';
        });
        
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
      const categoryName = this.getLevel1Name(atcCode);
      this.logger.log(`Creating L1 category: ${atcCode} -> ${categoryName}`);
      const category = await this.findOrCreateCategory(categoryName, null);
      categoryMap.set(atcCode, category.id);
      stats.categoriesCreated++;
      this.logger.log(`Created category with ID: ${category.id}`);
    }

    // Create categories for L2 (Therapeutic Subgroup)
    for (const atcCode of stats.levels.l2) {
      const parentCode = atcCode.substring(0, 1); // Get L1 code
      const parentId = categoryMap.get(parentCode);
      const categoryName = this.getLevel2Name(atcCode);
      const category = await this.findOrCreateCategory(categoryName, parentId);
      categoryMap.set(atcCode, category.id);
      stats.categoriesCreated++;
    }

    // Create categories for L3 (Pharmacological Subgroup)
    for (const atcCode of stats.levels.l3) {
      const parentCode = atcCode.substring(0, 3); // Get L2 code
      const parentId = categoryMap.get(parentCode);
      const categoryName = this.getLevel3Name(atcCode, records);
      const category = await this.findOrCreateCategory(categoryName, parentId);
      categoryMap.set(atcCode, category.id);
      stats.categoriesCreated++;
    }

    // Create drug groups from L4 (Chemical Subgroup) and L5 (Chemical Substance)
    this.logger.log(`Creating drug groups from ${records.length} records`);
    for (const record of records) {
      if (record['ATC code_L4'] && record['name_L4']) {
        // Use L4 as drug group - truncate name to fit in 200 characters
        const rawName = `${record['ATC code_L4']} - ${record['name_L4']}`;
        const drugGroupName = rawName.length > 200 ? rawName.substring(0, 197) + '...' : rawName;
        const description = this.buildDescription(record);
        
        this.logger.log(`Creating drug group: ${drugGroupName}`);
        const drugGroup = await this.findOrCreateDrugGroup(drugGroupName, description);
        stats.drugGroupsCreated++;
        this.logger.log(`Created drug group with ID: ${drugGroup.id}`);

        // Link to L3 category
        const categoryId = categoryMap.get(record['ATC code_L3']);
        if (categoryId) {
          this.logger.log(`Linking drug group ${drugGroup.id} to category ${categoryId}`);
          await this.linkDrugGroupToCategory(drugGroup.id, categoryId);
          stats.drugGroupCategoriesLinked++;
        } else {
          this.logger.warn(`No category found for L3 code: ${record['ATC code_L3']}`);
        }
      } else {
        this.logger.warn(`Record missing L4 code or name: ${JSON.stringify(record)}`);
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

  private getLevel1Name(atcCode: string): string {
    // Map ATC Level 1 codes to names
    const level1Names: Record<string, string> = {
      'A': 'الجهاز الهضمي والتمثيل الغذائي',
      'B': 'الدم وأعضاء تكوين الدم',
      'C': 'الجهاز القلبي الوعائي',
      'D': 'مستحضرات الجلد',
      'G': 'الجهاز البولي التناسلي والهرمونات الجنسية',
      'H': 'مستحضرات هرمونية جهازية، باستثناء الهرمونات الجنسية والأنسولين',
      'J': 'مضادات العدوى للاستخدام الجهازي',
      'L': 'العوامل المضادة للأورام والمعدلة للمناعة',
      'M': 'الجهاز العضلي الهيكلي',
      'N': 'الجهاز العصبي',
      'P': 'منتجات مضادة للطفيليات ومبيدات حشرية وطاردات',
      'R': 'الجهاز التنفسي',
      'S': 'الأعضاء الحسية',
      'V': 'متنوع'
    };
    
    return level1Names[atcCode] || `المستوى الأول ATC: ${atcCode}`;
  }

  private getLevel2Name(atcCode: string): string {
    // Truncate to fit in 100 characters
    const name = `المستوى الثاني: ${atcCode}`;
    return name.length > 100 ? name.substring(0, 97) + '...' : name;
  }

  private getLevel3Name(atcCode: string, records: AtcRecord[]): string {
    // Find the record with this L3 code to get the name
    const record = records.find(r => r['ATC code_L3'] === atcCode);
    const name = record ? record['name_L3'] : `المستوى الثالث: ${atcCode}`;
    
    // Truncate to fit in 100 characters
    return name.length > 100 ? name.substring(0, 97) + '...' : name;
  }

  private buildDescription(record: AtcRecord): string {
    const parts: string[] = [];
    
    if (record['ATC code_L5'] && record['Name_L5']) {
      parts.push(`المادة الكيميائية: ${record['Name_L5']} (${record['ATC code_L5']})`);
    }
    
    if (record['DDD_L5']) {
      parts.push(`الجرعة اليومية المحددة: ${record['DDD_L5']} ${record['U_L5'] || ''}`);
    }
    
    if (record['Adm.R_L5']) {
      parts.push(`طريق الإعطاء: ${record['Adm.R_L5']}`);
    }
    
    if (record['Note_L5']) {
      parts.push(`ملاحظة: ${record['Note_L5']}`);
    }
    
    if (record['href_L5']) {
      parts.push(`المرجع: ${record['href_L5']}`);
    }
    
    return parts.join('\n');
  }

  private async findOrCreateCategory(name: string, parentId: string | null | undefined): Promise<any> {
    this.logger.debug(`Looking for category with nameAr: ${name}`);
    
    // Try to find existing category
    const existing = await this.prisma.category.findFirst({
      where: { nameAr: name }
    });

    if (existing) {
      this.logger.debug(`Found existing category: ${existing.id}`);
      return existing;
    }

    this.logger.debug(`Creating new category: ${name} with parentId: ${parentId || 'null'}`);
    
    // Create new category
    return this.prisma.category.create({
      data: {
        nameAr: name,
        nameEn: name,
        parentId: parentId || null,
        isActive: true
      }
    });
  }

  private async findOrCreateDrugGroup(name: string, description: string): Promise<any> {
    this.logger.debug(`Looking for drug group with nameAr: ${name}`);
    
    // Try to find existing drug group
    const existing = await this.prisma.drugGroup.findFirst({
      where: { nameAr: name }
    });

    if (existing) {
      this.logger.debug(`Found existing drug group: ${existing.id}`);
      return existing;
    }

    this.logger.debug(`Creating new drug group: ${name}`);
    
    // Create new drug group
    return this.prisma.drugGroup.create({
      data: {
        nameAr: name,
        nameEn: name,
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