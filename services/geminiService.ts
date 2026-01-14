
import { GoogleGenAI, Type } from "@google/genai";
import { TransformationStats, TransformedMenuItem } from "../types";

export const getAIInsights = async (stats: TransformationStats, sampleData: any[]) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `
    Analyze this menu transformation summary and sample data from a Middle Eastern / UAE market perspective:
    - Total Items: ${stats.totalItemsProcessed}
    - Arabic Coverage (Existing): ${stats.arabicTranslationsFound}/${stats.totalItemsProcessed}
    - AI Translated: ${stats.autoTranslatedCount} items
    - Calories Estimated: ${stats.caloriesEstimatedCount} items
    - Currencies: ${stats.currenciesDetected.join(', ')}
    - Anomalies: ${stats.anomalies.length} detected.
    
    Sample Items: ${JSON.stringify(sampleData.slice(0, 3))}
    
    Provide a professional, concise summary. Focus on:
    1. Data quality and consistency.
    2. STRICT DIETARY COMPLIANCE: If any items look like they might contain ingredients prohibited by local GCC customs (Pork, Alcohol), flag them immediately for manual review.
    3. Suggestions for menu naming that fits the UAE/GCC market standards (e.g. using "Beef" or "Turkey" prefixes where relevant).
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini AI failed:", error);
    return "AI insights unavailable at the moment.";
  }
};

export const translateMissingArabic = async (
  data: TransformedMenuItem[],
  onProgress?: (current: number, total: number) => void
): Promise<{ data: TransformedMenuItem[], count: number }> => {
  const arabicRegex = /[\u0600-\u06FF]/;
  const translatedData = [...data];
  let alreadyArabicCount = 0;

  // First pass: If source is already Arabic, copy to Arabic column and skip AI translation
  translatedData.forEach(item => {
    const name = (item['Menu Item Name'] || '').toString();
    const desc = (item['Description'] || '').toString();
    const brandName = (item['Brand Name'] || '').toString();
    const modGroup = (item['Modifier Group Name'] || '').toString();
    const modName = (item['Modifier Name'] || '').toString();

    // If source is Arabic and Arabic column is empty, copy it over
    if (name && arabicRegex.test(name) && !item['Menu Item Name[ar-ae]']) {
      item['Menu Item Name[ar-ae]'] = name;
      alreadyArabicCount++;
    }
    if (desc && arabicRegex.test(desc) && !item['Description[ar-ae]']) {
      item['Description[ar-ae]'] = desc;
    }
    if (brandName && arabicRegex.test(brandName) && !item['Brand Name[ar-ae]']) {
      item['Brand Name[ar-ae]'] = brandName;
    }
    if (modGroup && arabicRegex.test(modGroup) && !item['Modifier Group Name[ar-ae]']) {
      item['Modifier Group Name[ar-ae]'] = modGroup;
    }
    if (modName && arabicRegex.test(modName) && !item['Modifier Name[ar-ae]']) {
      item['Modifier Name[ar-ae]'] = modName;
    }
  });

  // Second pass: Only translate items that have non-Arabic source and empty Arabic column
  const itemsToTranslate = translatedData.filter(item => {
    const name = (item['Menu Item Name'] || '').toString();
    const desc = (item['Description'] || '').toString();
    const brandName = (item['Brand Name'] || '').toString();
    const modGroup = (item['Modifier Group Name'] || '').toString();
    const modName = (item['Modifier Name'] || '').toString();

    // Need translation if: source exists, is NOT Arabic, and Arabic column is empty
    const needsNameTranslation = name && !arabicRegex.test(name) && !item['Menu Item Name[ar-ae]'];
    const needsDescTranslation = desc && !arabicRegex.test(desc) && !item['Description[ar-ae]'];
    const needsBrandTranslation = brandName && !arabicRegex.test(brandName) && !item['Brand Name[ar-ae]'];
    const needsModGroupTranslation = modGroup && !arabicRegex.test(modGroup) && !item['Modifier Group Name[ar-ae]'];
    const needsModNameTranslation = modName && !arabicRegex.test(modName) && !item['Modifier Name[ar-ae]'];

    return needsNameTranslation || needsDescTranslation || needsBrandTranslation || needsModGroupTranslation || needsModNameTranslation;
  });

  if (itemsToTranslate.length === 0) return { data: translatedData, count: alreadyArabicCount };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const batchSize = 25; // Increased from 10 to 25
  const concurrency = 3; // Process 3 batches in parallel
  let totalTranslated = alreadyArabicCount;

  // Create all batches upfront
  const batches: typeof itemsToTranslate[] = [];
  for (let i = 0; i < itemsToTranslate.length; i += batchSize) {
    batches.push(itemsToTranslate.slice(i, i + batchSize));
  }

  // Process batches with controlled concurrency
  const processBatch = async (batch: typeof itemsToTranslate, batchIndex: number) => {
    const translationList = batch.map(item => {
      const name = (item['Menu Item Name'] || '').toString();
      const desc = (item['Description'] || '').toString();
      const brandName = (item['Brand Name'] || '').toString();
      const modGroup = (item['Modifier Group Name'] || '').toString();
      const modName = (item['Modifier Name'] || '').toString();

      return {
        id: item['Menu Item Id'],
        // Only send non-Arabic fields for translation
        name: (name && !arabicRegex.test(name)) ? name : '',
        description: (desc && !arabicRegex.test(desc)) ? desc : '',
        brandName: (brandName && !arabicRegex.test(brandName)) ? brandName : '',
        modifierGroup: (modGroup && !arabicRegex.test(modGroup)) ? modGroup : '',
        modifierName: (modName && !arabicRegex.test(modName)) ? modName : ''
      };
    });

    const prompt = `
      You are an expert Arabic Menu Translator for the GCC/UAE market.
      Translate the following menu items, descriptions, and MODIFIERS into high-quality Arabic.

      CRITICAL RULES:
      - ONLY translate fields that have content. If a field is empty/null/undefined, return empty string for that field.
      - DO NOT create or invent content. Only translate what exists.
      - If description is empty, return empty string for desc_ar.

      MODIFIER RULES:
      1. SIZES: Small -> صغير, Medium -> متوسط, Large -> كبير, X-Large -> كبير جداً.
      2. VOLUMES: Convert 'ML' to 'مل' and 'L' to 'لتر'. Use Arabic numerals.
      3. QUANTITIES: 'Pcs' or 'Pieces' -> 'قطع'.
      4. CONSISTENCY: Ensure identical terms across the list use the same Arabic translation.
      5. TYPO FIXING: Correct source typos (e.g., "Meduim" -> "Medium") before translating.
      6. ORDERING: Return modifiers in a logical order (Smallest to Largest).

      STRICT CULTURAL & DIETARY COMPLIANCE:
      - ABSOLUTELY NO mention of Pork, Pig, or Alcohol.
      - "Bacon" -> "Beef Bacon" (لحم بقري مقدد).
      - "Pepperoni/Salami" -> "Beef Pepperoni" (بيبروني بقري).
      - "Ham" -> "Turkey Ham" (حبش) or "Beef Ham" (لحم بقري مدخن).
      - For Alcohol sauces, translate based on flavor (e.g. "Rich Sauce").

      Return a JSON array:
      [{ "id": "original_id", "name_ar": "Arabic Name or empty", "desc_ar": "Arabic Description or empty", "brand_ar": "Arabic Brand Name or empty", "mod_group_ar": "Arabic Mod Group or empty", "mod_name_ar": "Arabic Mod Name or empty" }]

      Items:
      ${JSON.stringify(translationList)}
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name_ar: { type: Type.STRING },
                desc_ar: { type: Type.STRING },
                brand_ar: { type: Type.STRING },
                mod_group_ar: { type: Type.STRING },
                mod_name_ar: { type: Type.STRING }
              },
              required: ["id", "name_ar", "desc_ar"]
            }
          }
        }
      });

      const results = JSON.parse(response.text || '[]');

      results.forEach((res: any) => {
        const index = translatedData.findIndex(item => item['Menu Item Id'] === res.id);
        if (index !== -1) {
          // Only set translation if source field exists and translation is not empty
          if (translatedData[index]['Menu Item Name'] && res.name_ar && !translatedData[index]['Menu Item Name[ar-ae]']) {
            translatedData[index]['Menu Item Name[ar-ae]'] = res.name_ar;
          }
          if (translatedData[index]['Description'] && res.desc_ar && !translatedData[index]['Description[ar-ae]']) {
            translatedData[index]['Description[ar-ae]'] = res.desc_ar;
          }
          if (translatedData[index]['Brand Name'] && res.brand_ar && !translatedData[index]['Brand Name[ar-ae]']) {
            translatedData[index]['Brand Name[ar-ae]'] = res.brand_ar;
          }
          if (translatedData[index]['Modifier Group Name'] && res.mod_group_ar) {
            translatedData[index]['Modifier Group Name[ar-ae]'] = res.mod_group_ar;
          }
          if (translatedData[index]['Modifier Name'] && res.mod_name_ar) {
            translatedData[index]['Modifier Name[ar-ae]'] = res.mod_name_ar;
          }
          totalTranslated++;
        }
      });

      if (onProgress) {
        onProgress((batchIndex + 1) * batchSize, itemsToTranslate.length);
      }
    } catch (error) {
      console.error(`Batch ${batchIndex + 1} translation failed:`, error);
    }
  };

  // Process batches with concurrency limit
  for (let i = 0; i < batches.length; i += concurrency) {
    const batchGroup = batches.slice(i, i + concurrency);
    await Promise.all(batchGroup.map((batch, idx) => processBatch(batch, i + idx)));
  }

  return { data: translatedData, count: totalTranslated };
};

export const translateArabicToEnglish = async (
  data: TransformedMenuItem[],
  onProgress?: (current: number, total: number) => void
): Promise<{ data: TransformedMenuItem[], count: number }> => {
  const arabicRegex = /[\u0600-\u06FF]/;
  const itemsToTranslate = data.filter(item => {
    const name = (item['Menu Item Name'] || '').toString();
    const desc = (item['Description'] || '').toString();
    const brandName = (item['Brand Name'] || '').toString();
    const modGroup = (item['Modifier Group Name'] || '').toString();
    const modName = (item['Modifier Name'] || '').toString();
    return arabicRegex.test(name) || arabicRegex.test(desc) || arabicRegex.test(brandName) || arabicRegex.test(modGroup) || arabicRegex.test(modName);
  });

  if (itemsToTranslate.length === 0) return { data, count: 0 };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const batchSize = 25;
  const concurrency = 3;
  const translatedData = [...data];
  let totalTranslated = 0;

  const batches: typeof itemsToTranslate[] = [];
  for (let i = 0; i < itemsToTranslate.length; i += batchSize) {
    batches.push(itemsToTranslate.slice(i, i + batchSize));
  }

  const processBatch = async (batch: typeof itemsToTranslate, batchIndex: number) => {
    const translationList = batch.map(item => {
      const name = (item['Menu Item Name'] || '').toString();
      const desc = (item['Description'] || '').toString();
      const brandName = (item['Brand Name'] || '').toString();
      const modGroup = (item['Modifier Group Name'] || '').toString();
      const modName = (item['Modifier Name'] || '').toString();

      return {
        id: item['Menu Item Id'],
        // Only send Arabic fields for translation to English
        name: arabicRegex.test(name) ? name : '',
        description: arabicRegex.test(desc) ? desc : '',
        brandName: arabicRegex.test(brandName) ? brandName : '',
        modifierGroup: arabicRegex.test(modGroup) ? modGroup : '',
        modifierName: arabicRegex.test(modName) ? modName : ''
      };
    });

    const prompt = `
      You are an expert Menu Translator.
      Translate the following Arabic menu items and modifiers into professional English.
      If a field is empty, return empty string for that field.

      Return a JSON array:
      [{ "id": "original_id", "name_en": "English Name", "desc_en": "English Description", "brand_en": "English Brand Name", "mod_group_en": "English Modifier Group", "mod_name_en": "English Modifier Name" }]

      Items:
      ${JSON.stringify(translationList)}
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                name_en: { type: Type.STRING },
                desc_en: { type: Type.STRING },
                brand_en: { type: Type.STRING },
                mod_group_en: { type: Type.STRING },
                mod_name_en: { type: Type.STRING }
              },
              required: ["id", "name_en", "desc_en"]
            }
          }
        }
      });

      const results = JSON.parse(response.text || '[]');

      results.forEach((res: any) => {
        const index = translatedData.findIndex(item => item['Menu Item Id'] === res.id);
        if (index !== -1) {
          const originalName = translatedData[index]['Menu Item Name'];
          const originalDesc = translatedData[index]['Description'];
          const originalBrandName = translatedData[index]['Brand Name'];
          const originalModGroup = translatedData[index]['Modifier Group Name'];
          const originalModName = translatedData[index]['Modifier Name'];

          // Translate name: Arabic -> English, keep Arabic in [ar-ae]
          if (arabicRegex.test(originalName) && res.name_en) {
             translatedData[index]['Menu Item Name[ar-ae]'] = originalName;
             translatedData[index]['Menu Item Name'] = res.name_en;
          }
          // Translate description: Arabic -> English, keep Arabic in [ar-ae]
          if (arabicRegex.test(originalDesc) && res.desc_en) {
             translatedData[index]['Description[ar-ae]'] = originalDesc;
             translatedData[index]['Description'] = res.desc_en;
          }
          // Translate brand name: Arabic -> English, keep Arabic in [ar-ae]
          if (arabicRegex.test(originalBrandName) && res.brand_en) {
             translatedData[index]['Brand Name[ar-ae]'] = originalBrandName;
             translatedData[index]['Brand Name'] = res.brand_en;
          }
          // Translate modifier group: Arabic -> English, keep Arabic in [ar-ae]
          if (arabicRegex.test(originalModGroup) && res.mod_group_en) {
             translatedData[index]['Modifier Group Name[ar-ae]'] = originalModGroup;
             translatedData[index]['Modifier Group Name'] = res.mod_group_en;
          }
          // Translate modifier name: Arabic -> English, keep Arabic in [ar-ae]
          if (arabicRegex.test(originalModName) && res.mod_name_en) {
             translatedData[index]['Modifier Name[ar-ae]'] = originalModName;
             translatedData[index]['Modifier Name'] = res.mod_name_en;
          }
          totalTranslated++;
        }
      });

      if (onProgress) {
        onProgress((batchIndex + 1) * batchSize, itemsToTranslate.length);
      }
    } catch (error) {
      console.error(`Batch ${batchIndex + 1} Ar to En translation failed:`, error);
    }
  };

  for (let i = 0; i < batches.length; i += concurrency) {
    const batchGroup = batches.slice(i, i + concurrency);
    await Promise.all(batchGroup.map((batch, idx) => processBatch(batch, i + idx)));
  }

  return { data: translatedData, count: totalTranslated };
};

export const estimateCaloriesForItems = async (
  data: TransformedMenuItem[],
  onProgress?: (current: number, total: number) => void
): Promise<{ data: TransformedMenuItem[], count: number }> => {
  const itemsToEstimate = data.filter(item => !item['Calories(kcal)']);

  if (itemsToEstimate.length === 0) return { data, count: 0 };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const batchSize = 30; // Increased from 10 to 30 (calorie estimation is simpler)
  const concurrency = 3;
  const processedData = [...data];
  let totalEstimated = 0;

  const batches: typeof itemsToEstimate[] = [];
  for (let i = 0; i < itemsToEstimate.length; i += batchSize) {
    batches.push(itemsToEstimate.slice(i, i + batchSize));
  }

  const processBatch = async (batch: typeof itemsToEstimate, batchIndex: number) => {
    const estimateList = batch.map(item => ({
      id: item['Menu Item Id'],
      name: item['Menu Item Name'],
      description: item['Description'],
      ingredients: item['Ingredient'],
      classification: item['Classification']
    }));

    const prompt = `
      Estimate typical calorie counts for these menu items based on standard GCC market ingredients.
      Return JSON: [{ "id": "original_id", "calories": number }]
      
      Items:
      ${JSON.stringify(estimateList)}
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                calories: { type: Type.NUMBER }
              },
              required: ["id", "calories"]
            }
          }
        }
      });

      const results = JSON.parse(response.text || '[]');
      
      results.forEach((res: any) => {
        const index = processedData.findIndex(item => item['Menu Item Id'] === res.id);
        if (index !== -1) {
          processedData[index]['Calories(kcal)'] = res.calories.toString();
          totalEstimated++;
        }
      });

      if (onProgress) {
        onProgress((batchIndex + 1) * batchSize, itemsToEstimate.length);
      }
    } catch (error) {
      console.error(`Batch ${batchIndex + 1} calorie estimation failed:`, error);
    }
  };

  for (let i = 0; i < batches.length; i += concurrency) {
    const batchGroup = batches.slice(i, i + concurrency);
    await Promise.all(batchGroup.map((batch, idx) => processBatch(batch, i + idx)));
  }

  return { data: processedData, count: totalEstimated };
};
