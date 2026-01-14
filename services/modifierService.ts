
import * as XLSX from 'xlsx';

/**
 * Modifier Group Template Transformation Service
 * Transforms raw Grubtech modifier exports into clean flat format
 */

export interface ModifierRow {
  'Modifier Group Template Id'?: string;
  'Modifier Group Template Name'?: string;
  'Modifier Group Template Name[ar-ae]'?: string;
  'Modifier Id'?: string;
  'Modifier Name'?: string;
  'Modifier Name[ar-ae]'?: string;
  'Modifier External Id'?: string;
  'Modifier Max Limit'?: string | number;
  'Price[BHD]'?: string | number;
  'Price[AED]'?: string | number;
  'Price[SAR]'?: string | number;
  'Price[GBP]'?: string | number;
  'Price[QAR]'?: string | number;
  'Calories(kcal)'?: string | number;
  [key: string]: any;
}

export interface ModifierTransformResult {
  data: ModifierRow[];
  outputColumns: string[];
}

/**
 * Check if a value contains a translation pattern like [ar-ae]:text
 */
const isTranslationValue = (value: any): boolean => {
  if (!value || typeof value !== 'string') return false;
  return /^\[[a-z]{2}(-[a-z]{2})?\]:/.test(value.trim());
};

/**
 * Extract language code and text from translation pattern
 * e.g., "[ar-ae]:بسكويت" -> { langCode: "ar-ae", text: "بسكويت" }
 */
const parseTranslation = (value: string): { langCode: string; text: string } | null => {
  const match = value.trim().match(/^\[([^\]]+)\]:(.+)$/);
  if (!match) return null;
  return { langCode: match[1].toLowerCase(), text: match[2].trim() };
};

/**
 * Check if text contains Arabic characters
 */
const hasArabicText = (text: string): boolean => {
  if (!text) return false;
  return /[\u0600-\u06FF]/.test(text);
};

/**
 * Check if a row is a translation row (main ID fields are empty, but has translation values)
 */
const isTranslationRow = (row: any): boolean => {
  const groupId = row['Modifier Group Template Id'];
  const modifierId = row['Modifier Id'];
  const groupName = String(row['Modifier Group Template Name'] || '');
  const modifierName = String(row['Modifier Name'] || '');

  // If main IDs are empty/missing and names have translation patterns
  const hasEmptyIds = !groupId && !modifierId;
  const hasTranslationPattern = isTranslationValue(groupName) || isTranslationValue(modifierName);

  return hasEmptyIds && hasTranslationPattern;
};

/**
 * Transform raw modifier export data into clean flat format
 * Tracks original columns from input and generated columns during transformation
 */
export const transformModifierData = (rawData: any[]): ModifierTransformResult => {
  const outputRows: ModifierRow[] = [];
  let currentModifier: ModifierRow = {};

  // Handle empty data case
  if (!rawData || rawData.length === 0) {
    return {
      data: [],
      outputColumns: []
    };
  }

  // Track original columns from input data before any processing
  const originalColumns = Object.keys(rawData[0]);
  console.log('📋 Original columns from input:', originalColumns);

  // Track generated columns during transformation using a Set
  const generatedColumns = new Set<string>();

  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i];
    const groupId = row['Modifier Group Template Id'];
    const modifierId = row['Modifier Id'];
    const groupName = String(row['Modifier Group Template Name'] || '');
    const modifierName = String(row['Modifier Name'] || '');

    // Check if this is a translation row
    if (isTranslationRow(row)) {
      // Extract Arabic translations and merge into current modifier
      if (isTranslationValue(groupName)) {
        const parsed = parseTranslation(groupName);
        if (parsed && parsed.langCode === 'ar-ae') {
          currentModifier['Modifier Group Template Name[ar-ae]'] = parsed.text;
          generatedColumns.add('Modifier Group Template Name[ar-ae]');
        }
      }

      if (isTranslationValue(modifierName)) {
        const parsed = parseTranslation(modifierName);
        if (parsed && parsed.langCode === 'ar-ae') {
          currentModifier['Modifier Name[ar-ae]'] = parsed.text;
          generatedColumns.add('Modifier Name[ar-ae]');
        }
      }
      continue;
    }

    // This is a main data row
    if (groupId) {
      // Save previous modifier if exists
      if (Object.keys(currentModifier).length > 0) {
        outputRows.push({ ...currentModifier });
      }

      // Check if names are in Arabic - if so, we'll clear them so Smart Translation can fill with English
      const groupNameIsArabic = hasArabicText(groupName);
      const modifierNameIsArabic = hasArabicText(modifierName);
      const brandName = String(row['Brand Name'] || '');
      const brandNameIsArabic = hasArabicText(brandName);

      // Copy ALL original columns from the row to preserve everything
      currentModifier = { ...row };

      // Override specific fields for Arabic handling
      if (row['Modifier Group Template Name']) {
        currentModifier['Modifier Group Template Name'] = groupNameIsArabic ? '' : groupName;
        if (groupNameIsArabic) {
          currentModifier['Modifier Group Template Name[ar-ae]'] = groupName;
          generatedColumns.add('Modifier Group Template Name[ar-ae]');
        }
      }

      if (row['Brand Name']) {
        currentModifier['Brand Name'] = brandNameIsArabic ? '' : brandName;
        if (brandNameIsArabic) {
          currentModifier['Brand Name[ar-ae]'] = brandName;
          generatedColumns.add('Brand Name[ar-ae]');
        }
      }

      if (row['Modifier Name']) {
        currentModifier['Modifier Name'] = modifierNameIsArabic ? '' : (modifierName || '');
        if (modifierNameIsArabic) {
          currentModifier['Modifier Name[ar-ae]'] = modifierName || '';
          generatedColumns.add('Modifier Name[ar-ae]');
        }
      }

      // Handle price transformation
      if (row['Modifier Price'] && row['Modifier Price Currency']) {
        const currency = String(row['Modifier Price Currency']).toUpperCase();
        const priceColumn = `Price[${currency}]`;
        currentModifier[priceColumn] = row['Modifier Price'];
        generatedColumns.add(priceColumn);
      }

    } else if (modifierId) {
      // Save previous modifier if exists
      if (Object.keys(currentModifier).length > 0) {
        outputRows.push({ ...currentModifier });
      }

      // Check if modifier name is Arabic
      const modifierNameIsArabic = hasArabicText(modifierName);

      // Copy ALL original columns from the row
      currentModifier = { ...row };

      // Override specific fields for Arabic handling
      if (row['Modifier Name']) {
        currentModifier['Modifier Name'] = modifierNameIsArabic ? '' : (modifierName || '');
        if (modifierNameIsArabic) {
          currentModifier['Modifier Name[ar-ae]'] = modifierName || '';
          generatedColumns.add('Modifier Name[ar-ae]');
        }
      }

      // Handle price transformation
      if (row['Modifier Price'] && row['Modifier Price Currency']) {
        const currency = String(row['Modifier Price Currency']).toUpperCase();
        const priceColumn = `Price[${currency}]`;
        currentModifier[priceColumn] = row['Modifier Price'];
        generatedColumns.add(priceColumn);
      }
    }
  }

  // Don't forget the last modifier
  if (Object.keys(currentModifier).length > 0) {
    outputRows.push({ ...currentModifier });
  }

  // Build smart output columns: keep original order, add [ar-ae] immediately after each base column
  const outputColumns: string[] = [];
  const processedColumns = new Set<string>();

  // Go through original columns in order, adding [ar-ae] pair right after each column
  originalColumns.forEach(col => {
    if (!processedColumns.has(col)) {
      outputColumns.push(col);
      processedColumns.add(col);

      // Check if this column has an [ar-ae] counterpart
      const arabicCol = `${col}[ar-ae]`;
      if (generatedColumns.has(arabicCol)) {
        outputColumns.push(arabicCol);
        processedColumns.add(arabicCol);
      }
    }
  });

  // Add any generated columns that weren't paired (like Price[SAR], Price[AED])
  Array.from(generatedColumns).forEach(col => {
    if (!processedColumns.has(col)) {
      outputColumns.push(col);
      processedColumns.add(col);
    }
  });

  console.log('📊 Final output columns:', outputColumns);
  console.log('🔧 Generated columns:', Array.from(generatedColumns));

  // Normalize output data to only include output columns
  const normalizedData = outputRows.map(row => {
    const orderedRow: ModifierRow = {};
    outputColumns.forEach(key => {
      orderedRow[key] = row[key] !== undefined && row[key] !== null ? row[key] : '';
    });
    return orderedRow;
  });

  return {
    data: normalizedData,
    outputColumns
  };
};

/**
 * Export modifier data to Excel with proper column ordering
 * Uses dynamic columns from transformation (original + generated) instead of hardcoded template
 */
export const downloadModifierExcel = (data: ModifierRow[], filename: string = 'modifiers', columns?: string[]) => {
  // Use provided columns or derive from data keys (which are already normalized)
  const outputColumns = columns ?? (data.length > 0 ? Object.keys(data[0]) : []);

  // Ensure all rows have all columns in the correct order
  const normalizedData = data.map(row => {
    const newRow: any = {};
    outputColumns.forEach(col => {
      newRow[col] = row[col] ?? '';
    });
    return newRow;
  });

  const worksheet = XLSX.utils.json_to_sheet(normalizedData, { header: outputColumns });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'MODIFIER_GROUP_TEMPLATE_REPORT');

  // Set column widths
  worksheet['!cols'] = outputColumns.map(col => ({
    wch: col.includes('Id') ? 28 : col.includes('Name') ? 25 : 15
  }));

  XLSX.writeFile(workbook, `${filename}_${Date.now()}.xlsx`);
};

/**
 * Export modifier data to CSV with proper column ordering
 * Uses dynamic columns from transformation (original + generated) instead of hardcoded template
 */
export const downloadModifierCSV = (data: ModifierRow[], filename: string = 'modifiers', columns?: string[]) => {
  // Use provided columns or derive from data keys (which are already normalized)
  const outputColumns = columns ?? (data.length > 0 ? Object.keys(data[0]) : []);

  const csvContent = [
    outputColumns.join(','),
    ...data.map(row =>
      outputColumns.map(col => {
        const val = row[col] ?? '';
        // Escape values with commas or quotes
        if (String(val).includes(',') || String(val).includes('"') || String(val).includes('\n')) {
          return `"${String(val).replace(/"/g, '""')}"`;
        }
        return val;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}_${Date.now()}.csv`;
  link.click();
};
