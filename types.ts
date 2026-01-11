
export interface RawMenuItem {
  'Menu Item Id'?: string | null;
  'Menu Item Name'?: string | null;
  'Brand Id'?: string | null;
  'Brand Name'?: string | null;
  'Preparation Time'?: string | null;
  'Description'?: string | null;
  'External Id'?: string | null;
  'Barcode'?: string | null;
  'Routing Label Id'?: string | null;
  'Routing Label'?: string | null;
  'Ingredient'?: string | null;
  'Packaging'?: string | null;
  'Price'?: string | null;
  'Modifier Group Name'?: string | null;
  'Classification'?: string | null;
  'Allergen'?: string | null;
  'Tag'?: string | null;
  'Calories(kcal)'?: string | null;
  'Caffeine Content(g)'?: string | null;
  'Sodium Content(g)'?: string | null;
  'Salt Content(g)'?: string | null;
  [key: string]: any;
}

export interface TransformedMenuItem extends Omit<RawMenuItem, 'Price'> {
  'Menu Item Name[ar-ae]'?: string;
  'Description[ar-ae]'?: string;
  'Image URL'?: string;
  '_imageSource'?: 'excel' | 'database' | 'generated' | 'none';
  [key: string]: any; 
}

export interface TransformationStats {
  totalRawRows: number;
  totalItemsProcessed: number;
  arabicTranslationsFound: number;
  autoTranslatedCount: number;
  autoTranslatedEnCount?: number;
  caloriesEstimatedCount: number;
  imagesFromDB: number;
  imagesGenerated: number;
  currenciesDetected: string[];
  anomalies: string[];
}

export interface TransformOptions {
  applyTitleCase: boolean;
  extractArabic: boolean;
  splitPrice: boolean;
  useStockImages: boolean;
  autoTranslate: boolean;
  autoTranslateArToEn: boolean;
  estimateCalories: boolean;
  generateAndSyncImages: boolean;
}
