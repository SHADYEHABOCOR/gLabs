
import { GoogleGenAI } from "@google/genai";
import { TransformedMenuItem } from "../types";

const DB_NAME = 'MenuAssetDB';
const STORE_NAME = 'images';
const DB_VERSION = 1;

/**
 * Category keywords for fallback image matching
 * Used when no direct name match is found, matches items by category keywords
 */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  burger: ['burger', 'beef', 'chicken burger', 'patty', 'ground meat', 'bun'],
  pizza: ['pizza', 'pie', 'italian', 'cheese', 'pepperoni', 'margherita'],
  cake: ['cake', 'pastry', 'bakery', 'dessert cake', 'layer', 'frosting'],
  coffee: ['coffee', 'espresso', 'latte', 'cappuccino', 'mocha', 'americano', 'beverage coffee'],
  sandwich: ['sandwich', 'sub', 'wrap', 'roll', 'panini', 'club'],
  salad: ['salad', 'greens', 'vegetables', 'lettuce', 'dressing'],
  chicken: ['chicken', 'poultry', 'fried chicken', 'grilled chicken', 'wings'],
  dessert: ['dessert', 'sweet', 'chocolate', 'brownie', 'pudding', 'mousse'],
  beverage: ['drink', 'juice', 'smoothie', 'tea', 'soda', 'water', 'beverage'],
  pasta: ['pasta', 'noodle', 'spaghetti', 'fettuccine', 'rigatoni', 'italian']
};

/**
 * IndexedDB Wrapper for robust image storage
 */
const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

/**
 * Cleans a filename to extract just the item name.
 * Converts "2._Crunchy_BBQ_Burger" to "Crunchy BBQ Burger"
 */
export const sanitizeFileName = (filename: string): string => {
  if (!filename) return '';
  return filename
    .replace(/^\d+[._-]*/, '')           // Remove leading numbers and separators (e.g., "2._" or "15-")
    .replace(/[_-]/g, ' ')               // Replace underscores and dashes with spaces
    .replace(/[^a-zA-Z0-9\s]/g, '')      // Remove special characters
    .replace(/\s+/g, ' ')                // Collapse multiple spaces
    .trim();
};

/**
 * Normalizes strings for database lookup.
 */
export const getDBKey = (str: string) => {
  if (!str) return 'img_unknown';
  return `img_${str.toString().toLowerCase().trim()
    .replace(/[_-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')}`;
};

/**
 * Calculate Levenshtein distance between two strings (for fuzzy matching)
 */
const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix: number[][] = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
};

/**
 * Normalize text for fuzzy matching (remove common variations)
 */
const normalizeForMatching = (text: string): string => {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[_-]/g, ' ')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(with|and|or|the|a|an)\b/g, '') // Remove common words
    .trim();
};

/**
 * Calculate similarity score between two strings (0-1, where 1 is identical)
 */
const calculateSimilarity = (str1: string, str2: string): number => {
  const normalized1 = normalizeForMatching(str1);
  const normalized2 = normalizeForMatching(str2);

  if (normalized1 === normalized2) return 1.0;
  if (!normalized1 || !normalized2) return 0;

  const maxLength = Math.max(normalized1.length, normalized2.length);
  const distance = levenshteinDistance(normalized1, normalized2);
  return 1 - (distance / maxLength);
};

/**
 * Find best matching image from database using smart matching
 * Returns { key: string, score: number } or null
 */
const findBestMatch = (
  itemName: string,
  itemId: string | undefined,
  db: Record<string, string>,
  threshold: number = 0.75
): { key: string; score: number; matchType: string } | null => {
  const dbKeys = Object.keys(db);

  // 1. Try exact ID match first (highest priority)
  if (itemId) {
    const idKey = getDBKey(itemId.toString());
    if (db[idKey]) {
      return { key: idKey, score: 1.0, matchType: 'exact-id' };
    }
  }

  // 2. Try exact name match
  const nameKey = getDBKey(itemName);
  if (db[nameKey]) {
    return { key: nameKey, score: 1.0, matchType: 'exact-name' };
  }

  // 3. Try fuzzy matching on all db keys
  let bestMatch: { key: string; score: number; matchType: string } | null = null;
  const normalizedItemName = normalizeForMatching(itemName);

  for (const dbKey of dbKeys) {
    // Extract the actual name from the key (remove 'img_' prefix)
    const dbName = dbKey.replace(/^img_/, '').replace(/_/g, ' ');
    const score = calculateSimilarity(itemName, dbName);

    if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
      bestMatch = { key: dbKey, score, matchType: 'fuzzy' };
    }
  }

  // 4. Try partial matching (if one name contains the other)
  if (!bestMatch) {
    for (const dbKey of dbKeys) {
      const dbName = normalizeForMatching(dbKey.replace(/^img_/, '').replace(/_/g, ' '));

      if (normalizedItemName.includes(dbName) || dbName.includes(normalizedItemName)) {
        const score = Math.max(
          dbName.length / normalizedItemName.length,
          normalizedItemName.length / dbName.length
        );

        if (score >= 0.5 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = { key: dbKey, score, matchType: 'partial' };
        }
      }
    }
  }

  return bestMatch;
};

/**
 * Helper to convert any image source to a high-quality JPG Blob
 */
export const convertToJpg = async (source: string | Blob): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas context failed'));
        return;
      }
      // JPG doesn't support transparency, so we fill with white first
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Conversion failed'));
      }, 'image/jpeg', 0.92); // 92% quality is a sweet spot for high res food shots
    };
    img.onerror = () => reject(new Error('Image load failed'));
    
    if (typeof source === 'string') {
      img.src = source;
    } else {
      img.src = URL.createObjectURL(source);
    }
  });
};

export const getLocalDB = async (): Promise<Record<string, string>> => {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    // Use cursor instead of getAll to avoid browser limits
    const result: Record<string, string> = {};
    const request = store.openCursor();

    request.onsuccess = (event: any) => {
      const cursor = event.target.result;
      if (cursor) {
        result[cursor.key as string] = cursor.value as string;
        cursor.continue();
      } else {
        // No more entries
        resolve(result);
      }
    };

    request.onerror = () => reject(request.error);
  });
};

export const saveToDB = async (key: string, base64: string) => {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.put(base64, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

export const bulkSaveToDB = async (
  newItems: Record<string, string>,
  onProgress?: (current: number, total: number) => void
) => {
  const keys = Object.keys(newItems);
  const total = keys.length;
  const CHUNK_SIZE = 500; // Process in chunks to avoid transaction limits

  let completed = 0;

  // Process in chunks
  for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
    const chunkKeys = keys.slice(i, i + CHUNK_SIZE);
    const db = await getDB();

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      chunkKeys.forEach((key) => {
        const request = store.put(newItems[key], key);
        request.onsuccess = () => {
          completed++;
          if (onProgress) onProgress(completed, total);
        };
      });

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
};

export const removeFromDB = async (key: string) => {
  const db = await getDB();
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const processImageSync = async (
  data: TransformedMenuItem[]
): Promise<{
  data: TransformedMenuItem[],
  generatedCount: number,
  dbCount: number,
  matchStats: {
    exactId: number;
    exactName: number;
    fuzzy: number;
    partial: number;
  }
}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const db = await getLocalDB();
  const processedData = [...data];
  let generatedCount = 0;
  let dbCount = 0;
  const matchStats = {
    exactId: 0,
    exactName: 0,
    fuzzy: 0,
    partial: 0
  };

  console.log(`🔍 Smart Image Matching: Loaded ${Object.keys(db).length} images from local database`);

  for (let i = 0; i < processedData.length; i++) {
    const item = processedData[i];
    const itemName = item['Menu Item Name'] || 'Unknown Item';
    const itemId = item['Menu Item Id'] || '';

    // Skip if image URL already exists in Excel
    if (item['Image URL'] && typeof item['Image URL'] === 'string' && item['Image URL'].startsWith('http')) {
      item._imageSource = 'excel';
      continue;
    }

    // Smart matching with fallback strategies
    const match = findBestMatch(itemName, itemId, db, 0.75);

    if (match) {
      item['Image URL'] = db[match.key];
      item._imageSource = 'database';
      dbCount++;

      // Track match type
      if (match.matchType === 'exact-id') matchStats.exactId++;
      else if (match.matchType === 'exact-name') matchStats.exactName++;
      else if (match.matchType === 'fuzzy') matchStats.fuzzy++;
      else if (match.matchType === 'partial') matchStats.partial++;

      // Log fuzzy matches for transparency
      if (match.matchType === 'fuzzy' || match.matchType === 'partial') {
        console.log(`🎯 ${match.matchType} match (${(match.score * 100).toFixed(0)}%): "${itemName}" → "${match.key.replace(/^img_/, '').replace(/_/g, ' ')}"`);
      }

      continue;
    }

    // No match found - generate new image
    try {
      if (generatedCount > 0) {
        await sleep(1500);
      }

      const prompt = `Generate a photo of ${itemName}.

        This must be a clean product photo with absolutely no text, no labels, no logos, no watermarks, no words, no letters, no numbers, no writing of any kind visible anywhere in the image.

        Style: Professional food photography, studio lighting, white or neutral background, the food item centered and well-lit, appetizing presentation, high resolution, sharp focus.

        ${item['Description'] ? `The dish is: ${item['Description']}` : ''}

        Important: Show only the finished prepared food. No raw ingredients as decoration. No pork, no alcohol.`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: {
            aspectRatio: "1:1"
          }
        }
      });

      if (!response.candidates || response.candidates.length === 0) {
        throw new Error("No candidates returned from Image API");
      }

      let base64Image = '';
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          base64Image = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }

      if (base64Image) {
        const nameKey = getDBKey(itemName);
        await saveToDB(nameKey, base64Image);
        item['Image URL'] = base64Image;
        item._imageSource = 'generated';
        generatedCount++;
      } else {
        item._imageSource = 'none';
      }
    } catch (error: any) {
      console.error(`Failed to generate image for ${itemName}:`, error);
      item._imageSource = 'none';
      if (error?.status === 429) break;
    }
  }

  // Log match statistics
  console.log(`📊 Image Match Statistics:
    ✓ Exact ID matches: ${matchStats.exactId}
    ✓ Exact name matches: ${matchStats.exactName}
    🎯 Fuzzy matches: ${matchStats.fuzzy}
    🔍 Partial matches: ${matchStats.partial}
    🎨 Generated: ${generatedCount}
    📁 Total from DB: ${dbCount}`);

  return { data: processedData, generatedCount, dbCount, matchStats };
};
