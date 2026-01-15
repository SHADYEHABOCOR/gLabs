/**
 * Column ordering utilities for Menu Studio Pro
 * Ensures [ar-ae] columns immediately follow their base columns in output
 */

/** Arabic Unicode range regex (covers Arabic script characters) */
const ARABIC_REGEX = /[\u0600-\u06FF]/;

/** English/Latin alphabet regex */
const ENGLISH_REGEX = /[A-Za-z]/;

/**
 * Checks if text contains Arabic characters
 * @param text - The text to check
 * @returns True if text contains Arabic characters, false otherwise
 */
export function isArabic(text: string | null | undefined): boolean {
  if (!text) return false;
  return ARABIC_REGEX.test(text.toString());
}

/**
 * Checks if text contains English/Latin characters
 * @param text - The text to check
 * @returns True if text contains English characters, false otherwise
 */
export function isEnglish(text: string | null | undefined): boolean {
  if (!text) return false;
  return ENGLISH_REGEX.test(text.toString());
}

/**
 * Orders columns so that [ar-ae] columns immediately follow their base columns
 * MUST be called as the LAST step before returning from any data modification function
 *
 * @param data - Array of data objects to reorder columns for
 * @returns Array with columns reordered so Arabic columns follow their base columns
 */
export function orderColumnsCorrectly<T extends Record<string, any>>(data: T[]): T[] {
  if (!data || !data.length) return data;

  // Collect all columns from all rows (handles sparse data)
  const allCols = new Set<string>();
  data.forEach(row => Object.keys(row).forEach(c => allCols.add(c)));

  // Separate base columns and Arabic columns
  const baseCols: string[] = [];
  const arabicMap = new Map<string, string>();

  allCols.forEach(col => {
    if (col.includes('[ar-ae]')) {
      const base = col.replace('[ar-ae]', '').trim();
      arabicMap.set(base, col);
    } else {
      baseCols.push(col);
    }
  });

  // Build ordered list: base column immediately followed by its [ar-ae] counterpart
  const ordered: string[] = [];
  baseCols.forEach(base => {
    ordered.push(base);
    const arabic = arabicMap.get(base) || arabicMap.get(base.trim());
    if (arabic) {
      ordered.push(arabic);
      // Remove from map to track orphaned Arabic columns
      arabicMap.delete(base);
      arabicMap.delete(base.trim());
    }
  });

  // Add any orphaned Arabic columns (Arabic columns without matching base) at the end
  arabicMap.forEach(arabicCol => {
    if (!ordered.includes(arabicCol)) {
      ordered.push(arabicCol);
    }
  });

  // Reorder each row to match the ordered column list
  return data.map(row => {
    const newRow: Record<string, any> = {};
    ordered.forEach(col => {
      if (col in row) {
        newRow[col] = row[col];
      }
    });
    return newRow as T;
  });
}
