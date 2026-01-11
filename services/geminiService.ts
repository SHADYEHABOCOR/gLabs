
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

export const translateMissingArabic = async (data: TransformedMenuItem[]): Promise<{ data: TransformedMenuItem[], count: number }> => {
  const itemsToTranslate = data.filter(item => 
    !item['Menu Item Name[ar-ae]'] || 
    !item['Description[ar-ae]'] || 
    (item['Modifier Group Name'] && !item['Modifier Group Name[ar-ae]'])
  );
  
  if (itemsToTranslate.length === 0) return { data, count: 0 };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const batchSize = 10;
  const translatedData = [...data];
  let totalTranslated = 0;

  for (let i = 0; i < itemsToTranslate.length; i += batchSize) {
    const batch = itemsToTranslate.slice(i, i + batchSize);
    const translationList = batch.map(item => ({
      id: item['Menu Item Id'],
      name: item['Menu Item Name'],
      description: item['Description'],
      modifierGroup: item['Modifier Group Name'],
      modifierName: item['Modifier Name'] // Included for comprehensive context
    }));

    const prompt = `
      You are an expert Arabic Menu Translator for the GCC/UAE market.
      Translate the following menu items, descriptions, and MODIFIERS into high-quality Arabic.
      
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
      [{ "id": "original_id", "name_ar": "Arabic Name", "desc_ar": "Arabic Description", "mod_group_ar": "Arabic Mod Group", "mod_name_ar": "Arabic Mod Name" }]
      
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
          if (!translatedData[index]['Menu Item Name[ar-ae]']) {
            translatedData[index]['Menu Item Name[ar-ae]'] = res.name_ar;
          }
          if (!translatedData[index]['Description[ar-ae]']) {
            translatedData[index]['Description[ar-ae]'] = res.desc_ar;
          }
          if (res.mod_group_ar) {
            translatedData[index]['Modifier Group Name[ar-ae]'] = res.mod_group_ar;
          }
          if (res.mod_name_ar) {
            translatedData[index]['Modifier Name[ar-ae]'] = res.mod_name_ar;
          }
          totalTranslated++;
        }
      });
    } catch (error) {
      console.error("Batch translation failed:", error);
    }
  }

  return { data: translatedData, count: totalTranslated };
};

export const translateArabicToEnglish = async (data: TransformedMenuItem[]): Promise<{ data: TransformedMenuItem[], count: number }> => {
  const arabicRegex = /[\u0600-\u06FF]/;
  const itemsToTranslate = data.filter(item => {
    const name = (item['Menu Item Name'] || '').toString();
    const desc = (item['Description'] || '').toString();
    const mod = (item['Modifier Group Name'] || '').toString();
    return arabicRegex.test(name) || arabicRegex.test(desc) || arabicRegex.test(mod);
  });
  
  if (itemsToTranslate.length === 0) return { data, count: 0 };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const batchSize = 10;
  const translatedData = [...data];
  let totalTranslated = 0;

  for (let i = 0; i < itemsToTranslate.length; i += batchSize) {
    const batch = itemsToTranslate.slice(i, i + batchSize);
    const translationList = batch.map(item => ({
      id: item['Menu Item Id'],
      name: item['Menu Item Name'],
      description: item['Description'],
      modifiers: item['Modifier Group Name']
    }));

    const prompt = `
      You are an expert Menu Translator.
      Translate the following Arabic menu items and modifiers into professional English.
      If the source is already English, leave it. Correct any obvious spelling errors.
      
      Return a JSON array:
      [{ "id": "original_id", "name_en": "English Name", "desc_en": "English Description", "mod_en": "English Modifiers" }]
      
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
                mod_en: { type: Type.STRING }
              },
              required: ["id", "name_en", "desc_en", "mod_en"]
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
          const originalMod = translatedData[index]['Modifier Group Name'];
          
          if (arabicRegex.test(originalName)) {
             translatedData[index]['Menu Item Name[ar-ae]'] = originalName;
             translatedData[index]['Menu Item Name'] = res.name_en;
          }
          if (arabicRegex.test(originalDesc)) {
             translatedData[index]['Description[ar-ae]'] = originalDesc;
             translatedData[index]['Description'] = res.desc_en;
          }
          if (arabicRegex.test(originalMod)) {
             translatedData[index]['Modifier Group Name[ar-ae]'] = originalMod;
             translatedData[index]['Modifier Group Name'] = res.mod_en;
          }
          totalTranslated++;
        }
      });
    } catch (error) {
      console.error("Batch Ar to En translation failed:", error);
    }
  }

  return { data: translatedData, count: totalTranslated };
};

export const estimateCaloriesForItems = async (data: TransformedMenuItem[]): Promise<{ data: TransformedMenuItem[], count: number }> => {
  const itemsToEstimate = data.filter(item => !item['Calories(kcal)']);
  
  if (itemsToEstimate.length === 0) return { data, count: 0 };

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const batchSize = 10;
  const processedData = [...data];
  let totalEstimated = 0;

  for (let i = 0; i < itemsToEstimate.length; i += batchSize) {
    const batch = itemsToEstimate.slice(i, i + batchSize);
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
    } catch (error) {
      console.error("Batch calorie estimation failed:", error);
    }
  }

  return { data: processedData, count: totalEstimated };
};
