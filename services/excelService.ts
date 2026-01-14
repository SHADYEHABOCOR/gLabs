
import * as XLSX from 'xlsx';
import { RawMenuItem, TransformedMenuItem, TransformationStats, TransformOptions } from '../types';

const SMALL_WORDS = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'ml', 'l', 'pcs'];

// Standardized mapping for common header variations
const HEADER_MAPPINGS: Record<string, string> = {
  'id': 'Menu Item Id',
  'item id': 'Menu Item Id',
  'menu item id': 'Menu Item Id',
  'item_id': 'Menu Item Id',
  'name': 'Menu Item Name',
  'item name': 'Menu Item Name',
  'menu item name': 'Menu Item Name',
  'title': 'Menu Item Name',
  'brand': 'Brand Name',
  'brand name': 'Brand Name',
  'brand id': 'Brand Id',
  'description': 'Description',
  'desc': 'Description',
  'price': 'Price',
  'cost': 'Price',
  'amount': 'Price',
  'calories': 'Calories(kcal)',
  'kcal': 'Calories(kcal)',
  'tag': 'Tag',
  'tags': 'Tag',
  'classification': 'Classification',
  'allergen': 'Allergen',
  'allergens': 'Allergen',
  'external id': 'External Id',
  'barcode': 'Barcode',
  'active': 'Active',
  'status': 'Active',
  'enabled': 'Active',
  'category': 'Tag',
  'images': 'Image URL',
  'image': 'Image URL',
  'image url': 'Image URL',
  'imageurl': 'Image URL',
  'modifier group': 'Modifier Group Name',
  'modifier group name': 'Modifier Group Name',
  'mod group': 'Modifier Group Name',
  'modifiergroup': 'Modifier Group Name',
  'addon group': 'Modifier Group Name',
  'modifier name': 'Modifier Name',
  'modifier_name': 'Modifier Name',
  'modifiername': 'Modifier Name',
  'modifier': 'Modifier Name',
  'addon': 'Modifier Name',
  'addon name': 'Modifier Name',
  'sub modifier group': 'Sub-Modifier Group Name',
  'sub-modifier group': 'Sub-Modifier Group Name',
  'sub modifier name': 'Sub-Modifier Name',
  'sub-modifier name': 'Sub-Modifier Name'
};

/**
 * Normalizes an object's keys based on the HEADER_MAPPINGS
 * Also handles language-specific formats like "NAME (EN)", "Description (AR)", etc.
 */
const normalizeRow = (row: any): RawMenuItem => {
  const normalized: any = {};
  Object.keys(row).forEach(key => {
    const cleanKey = key.toLowerCase().trim();

    // Check for language-specific formats: "NAME (EN)", "Description (AR)", etc.
    const langMatch = cleanKey.match(/^(.+?)\s*\((en|ar|ar-ae)\)$/i);
    if (langMatch) {
      const baseName = langMatch[1].trim();
      const lang = langMatch[2].toLowerCase();

      // Map the base name to standard field
      const mappedBase = HEADER_MAPPINGS[baseName] || baseName;

      // Add language suffix for non-English
      if (lang === 'ar' || lang === 'ar-ae') {
        normalized[`${mappedBase}[ar-ae]`] = row[key];
      } else {
        // English version goes to the standard field name
        normalized[mappedBase] = row[key];
      }
      return;
    }

    // Check for bracket format: "NAME [EN]", "Description [AR]", etc.
    const bracketMatch = cleanKey.match(/^(.+?)\s*\[(en|ar|ar-ae)\]$/i);
    if (bracketMatch) {
      const baseName = bracketMatch[1].trim();
      const lang = bracketMatch[2].toLowerCase();

      const mappedBase = HEADER_MAPPINGS[baseName] || baseName;

      if (lang === 'ar' || lang === 'ar-ae') {
        normalized[`${mappedBase}[ar-ae]`] = row[key];
      } else {
        normalized[mappedBase] = row[key];
      }
      return;
    }

    // Standard mapping
    const mappedKey = HEADER_MAPPINGS[cleanKey] || key;
    normalized[mappedKey] = row[key];
  });
  return normalized as RawMenuItem;
};

export const applyTitleCase = (text: string | null | undefined): string => {
  if (!text) return '';
  const words = text.toLowerCase().split(' ');
  return words.map((word, index) => {
    // Keep units like ML or PCS in caps if they are at the end or recognized
    if (['ml', 'l', 'pcs'].includes(word)) return word.toUpperCase();
    if (index > 0 && SMALL_WORDS.includes(word)) {
      return word;
    }
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(' ');
};

const parsePrice = (priceStr: string | null | undefined) => {
  if (!priceStr) return { currency: null, value: null };
  const cleanPrice = priceStr.toString().trim();
  const currencyMatch = cleanPrice.match(/([A-Z]{3})/i);
  const valueMatch = cleanPrice.match(/([\d,.]+)/);

  const currency = currencyMatch ? currencyMatch[1].toUpperCase() : 'AED';
  const value = valueMatch ? parseFloat(valueMatch[1].replace(',', '')) : null;

  return { currency, value };
};

/**
 * Converts Google Drive links to direct thumbnail URLs
 */
const convertDriveLinkToDirectUrl = (url: string): string => {
  if (!url || typeof url !== 'string') return url;

  // Check if it's a Google Drive link
  if (url.includes('drive.google.com')) {
    // Extract file ID from various Drive URL formats
    const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
    if (fileIdMatch) {
      // Convert to thumbnail API endpoint (works without auth for public files)
      return `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w1000`;
    }
  }

  return url;
};

export const transformMenuData = (
  rawData: any[],
  options: TransformOptions
): { data: TransformedMenuItem[]; stats: TransformationStats } => {
  const transformedData: TransformedMenuItem[] = [];
  const currencies = new Set<string>();
  const anomalies: string[] = [];
  let arabicCount = 0;

  if (!rawData || rawData.length === 0) {
    return {
      data: [],
      stats: {
        totalRawRows: 0,
        totalItemsProcessed: 0,
        arabicTranslationsFound: 0,
        autoTranslatedCount: 0,
        caloriesEstimatedCount: 0,
        imagesFromDB: 0,
        imagesGenerated: 0,
        currenciesDetected: [],
        anomalies: ['The uploaded file appears to be empty.']
      }
    };
  }

  let currentItem: TransformedMenuItem | null = null;

  for (let i = 0; i < rawData.length; i++) {
    const rawRow = rawData[i];
    const row = normalizeRow(rawRow);

    // Check if this is a translation row (standard in some Grubtech exports)
    const itemName = row['Menu Item Name'] || row['Modifier Name'] || row['Modifier Group Name'] || '';
    const isTranslationRow = (!row['Menu Item Id'] || row['Menu Item Id'] === '') && itemName.toString().startsWith('[ar-ae]:');

    if (isTranslationRow && options.extractArabic) {
      if (currentItem) {
        const cleanVal = itemName.toString().replace('[ar-ae]:', '').trim();
        // If it's a modifier or group, map it accordingly
        if (row['Modifier Group Name']) {
          currentItem['Modifier Group Name[ar-ae]'] = cleanVal;
        } else if (row['Modifier Name']) {
          currentItem['Modifier Name[ar-ae]'] = cleanVal;
        } else {
          currentItem['Menu Item Name[ar-ae]'] = cleanVal;
        }

        const desc = row['Description'] || '';
        if (desc.toString().startsWith('[ar-ae]:')) {
          currentItem['Description[ar-ae]'] = desc.toString().replace('[ar-ae]:', '').trim();
        }
        arabicCount++;
      } else {
        anomalies.push(`Orphan Arabic translation found at row ${i + 2}: "${itemName}"`);
      }
      continue;
    }

    const itemId = row['Menu Item Id'];
    if (itemId || itemName) {
      const newItem: TransformedMenuItem = { ...row };
      
      if (!newItem['Menu Item Id']) {
        newItem['Menu Item Id'] = `auto-gen-${i}`;
      }
      
      delete (newItem as any).Price;

      if (options.applyTitleCase) {
        [
          'Menu Item Name', 'Description', 'Brand Name', 'Tag', 'Classification', 'Routing Label',
          'Modifier Group Name', 'Modifier Name', 'Sub-Modifier Group Name', 'Sub-Modifier Name'
        ].forEach(key => {
          if (newItem[key]) newItem[key] = applyTitleCase(newItem[key].toString());
        });
      }

      if (options.splitPrice && row['Price']) {
        const { currency, value } = parsePrice(row['Price'].toString());
        if (currency && value !== null) {
          newItem[`Price[${currency}]`] = value;
          currencies.add(currency);
        }
      }

      // Automatically convert Google Drive links in Image URL field
      if (newItem['Image URL']) {
        const imageUrl = newItem['Image URL'].toString();
        if (imageUrl.includes('drive.google.com')) {
          newItem['Image URL'] = convertDriveLinkToDirectUrl(imageUrl);
        }
      }

      transformedData.push(newItem);
      currentItem = newItem;
    }
  }

  const finalOrder = [
    'Menu Item Id',
    'Menu Item Name', 'Menu Item Name[ar-ae]',
    'Description', 'Description[ar-ae]',
    'Brand Id', 'Brand Name', 'Brand Name[ar-ae]',
    'Modifier Group Name', 'Modifier Group Name[ar-ae]',
    'Modifier Name', 'Modifier Name[ar-ae]',
    'Sub-Modifier Group Name', 'Sub-Modifier Group Name[ar-ae]',
    'Sub-Modifier Name', 'Sub-Modifier Name[ar-ae]',
    'External Id', 'Barcode',
    'Preparation Time',
    'Routing Label Id', 'Routing Label', 'Routing Label[ar-ae]',
    'Ingredient', 'Packaging'
  ];

  const sortedCurrencies = Array.from(currencies).sort();
  sortedCurrencies.forEach(curr => finalOrder.push(`Price[${curr}]`));

  finalOrder.push(
    'Classification', 'Classification[ar-ae]',
    'Allergen', 'Allergen[ar-ae]',
    'Tag', 'Tag[ar-ae]',
    'Calories(kcal)', 'Caffeine Content(g)', 'Sodium Content(g)', 'Salt Content(g)',
    'Image URL'
  );

  // Keep all columns, don't filter out empty ones
  const activeColumns = finalOrder;

  const normalizedData = transformedData.map(item => {
    const orderedItem: any = {};
    activeColumns.forEach(key => {
      orderedItem[key] = (item[key] !== undefined && item[key] !== null) ? item[key] : '';
    });
    orderedItem._imageSource = item._imageSource || 'none';
    return orderedItem;
  });

  return {
    data: normalizedData,
    stats: {
      totalRawRows: rawData.length,
      totalItemsProcessed: transformedData.length,
      arabicTranslationsFound: arabicCount,
      autoTranslatedCount: 0,
      caloriesEstimatedCount: 0,
      imagesFromDB: 0,
      imagesGenerated: 0,
      currenciesDetected: sortedCurrencies,
      anomalies
    }
  };
};

const sanitizeDataForExport = (data: any[]) => {
  if (!data) return [];
  return data.map(({ _imageSource, ...rest }) => {
    const item = { ...rest };
    if (item['Image URL'] && typeof item['Image URL'] === 'string' && item['Image URL'].startsWith('data:')) {
      item['Image URL'] = '[BASE64_IMAGE_DATA_EXCLUDED_USE_ZIP]';
    }
    return item;
  });
};

export const downloadExcel = (data: any[], fileName: string) => {
  const cleanData = sanitizeDataForExport(data);
  const ws = XLSX.utils.json_to_sheet(cleanData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Transformed Menu");
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

export const downloadCSV = (data: any[], fileName: string) => {
  const cleanData = sanitizeDataForExport(data);
  const ws = XLSX.utils.json_to_sheet(cleanData);
  const csv = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `${fileName}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
