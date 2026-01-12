
import { GoogleGenAI } from "@google/genai";
import { TransformedMenuItem } from "../types";

const DB_NAME = 'MenuAssetDB';
const STORE_NAME = 'images';
const DB_VERSION = 1;

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
  dbCount: number 
}> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const db = await getLocalDB();
  const processedData = [...data];
  let generatedCount = 0;
  let dbCount = 0;

  for (let i = 0; i < processedData.length; i++) {
    const item = processedData[i];
    const itemName = item['Menu Item Name'] || 'Unknown Item';
    const itemId = item['Menu Item Id'] || '';
    
    if (item['Image URL'] && typeof item['Image URL'] === 'string' && item['Image URL'].startsWith('http')) {
      item._imageSource = 'excel';
      continue;
    }

    const idKey = itemId ? getDBKey(itemId.toString()) : null;
    const nameKey = getDBKey(itemName);

    if (idKey && db[idKey]) {
      item['Image URL'] = db[idKey];
      item._imageSource = 'database';
      dbCount++;
      continue;
    }

    if (db[nameKey]) {
      item['Image URL'] = db[nameKey];
      item._imageSource = 'database';
      dbCount++;
      continue;
    }

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

  return { data: processedData, generatedCount, dbCount };
};
