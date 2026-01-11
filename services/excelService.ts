
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
  'modifier group': 'Modifier Group Name',
  'modifier group name': 'Modifier Group Name',
  'mod group': 'Modifier Group Name',
  'modifier name': 'Modifier Name',
  'modifier_name': 'Modifier Name',
  'sub modifier group': 'Sub-Modifier Group Name',
  'sub modifier name': 'Sub-Modifier Name'
};

/**
 * Normalizes an object's keys based on the HEADER_MAPPINGS
 */
const normalizeRow = (row: any): RawMenuItem => {
  const normalized: any = {};
  Object.keys(row).forEach(key => {
    const cleanKey = key.toLowerCase().trim();
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
    const type = row['Type'] || '';
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
        ['Menu Item Name', 'Description', 'Brand Name', 'Tag', 'Classification', 'Routing Label', 'Modifier Group Name', 'Modifier Name'].forEach(key => {
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

      transformedData.push(newItem);
      currentItem = newItem;
    }
  }

  const finalOrder = [
    'Menu Item Id', 'Menu Item Name', 'Menu Item Name[ar-ae]',
    'Modifier Group Name', 'Modifier Group Name[ar-ae]',
    'Modifier Name', 'Modifier Name[ar-ae]',
    'Brand Id', 'Brand Name', 'Preparation Time',
    'Description', 'Description[ar-ae]',
    'External Id', 'Barcode', 'Routing Label Id', 'Routing Label',
    'Ingredient', 'Packaging'
  ];

  const sortedCurrencies = Array.from(currencies).sort();
  sortedCurrencies.forEach(curr => finalOrder.push(`Price[${curr}]`));

  finalOrder.push(
    'Classification', 'Allergen', 'Tag',
    'Calories(kcal)', 'Caffeine Content(g)', 'Sodium Content(g)', 'Salt Content(g)',
    'Image URL'
  );

  const normalizedData = transformedData.map(item => {
    const orderedItem: any = {};
    finalOrder.forEach(key => {
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
