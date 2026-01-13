
export interface ScrapedItem {
  id: string;
  name: string;
  imageUrl: string;
}

/**
 * Strips resolution-limiting parameters from CDN URLs to get the original high-res image.
 */
export const upscaleImageUrl = (url: string): string => {
  if (!url) return url;
  try {
    const urlObj = new URL(url.replace(/&amp;/g, '&'));

    // 1. DeliveryHero / Talabat patterns: ?width=172&height=172
    if (url.includes('images.deliveryhero.io')) {
      urlObj.searchParams.delete('width');
      urlObj.searchParams.delete('height');
      // Sometimes adding a large width is better than stripping if the CDN requires a size
      urlObj.searchParams.set('width', '1200');
    }

    // 2. Cloudinary / Generic resizing patterns (e.g., /w_172,h_172/ or /c_limit,w_172/)
    let newPath = urlObj.pathname;
    newPath = newPath.replace(/\/w_\d+,h_\d+\//, '/');
    newPath = newPath.replace(/\/w_\d+\//, '/');
    urlObj.pathname = newPath;

    // 3. Grubtech specific size parameters
    urlObj.searchParams.delete('size');

    // 4. UberEats Cloudfront patterns - request larger size
    if (url.includes('cloudfront.net') || url.includes('uber.com')) {
      // UberEats uses various size parameters, try to get max quality
      if (urlObj.searchParams.has('width')) {
        urlObj.searchParams.set('width', '1200');
      }
      if (urlObj.searchParams.has('height')) {
        urlObj.searchParams.set('height', '1200');
      }
    }

    return urlObj.toString();
  } catch (e) {
    // If URL parsing fails, try regex fallback
    return url
      .replace(/([?&])width=\d+/gi, '$1width=1200')
      .replace(/([?&])height=\d+/gi, '$1height=1200')
      .replace(/&amp;/g, '&');
  }
};

/**
 * Check if URL is an UberEats store URL
 */
const isUberEatsUrl = (url: string): boolean => {
  return url.includes('ubereats.com/store') || url.includes('ubereats.com/city');
};

/**
 * Extract items from UberEats __NEXT_DATA__ JSON structure
 */
const extractUberEatsItems = (data: any, results: ScrapedItem[] = []): ScrapedItem[] => {
  if (!data || typeof data !== 'object') return results;

  // Handle arrays
  if (Array.isArray(data)) {
    data.forEach(item => extractUberEatsItems(item, results));
    return results;
  }

  // UberEats stores menu items in various nested structures
  // Look for objects that have title/name and imageUrl patterns
  const title = data.title || data.name || data.itemTitle || data.displayName;
  const uuid = data.uuid || data.itemUuid || data.id;

  // UberEats image patterns
  let imageUrl = data.imageUrl || data.heroImageUrl || data.squareImageUrl || data.image;

  // Sometimes images are in nested objects
  if (!imageUrl && data.heroImage) {
    imageUrl = data.heroImage.url || data.heroImage;
  }
  if (!imageUrl && data.image && typeof data.image === 'object') {
    imageUrl = data.image.url || data.image.source;
  }
  if (!imageUrl && data.images && Array.isArray(data.images) && data.images.length > 0) {
    imageUrl = data.images[0].url || data.images[0];
  }

  // Check if this looks like a menu item
  if (title && typeof title === 'string' && title.length > 1 && title.length < 200) {
    if (imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('http')) {
      const itemId = uuid ? uuid.toString() : `uber-${results.length}`;

      // Avoid duplicates
      if (!results.find(r => r.name === title)) {
        results.push({
          id: itemId,
          name: title.trim(),
          imageUrl: upscaleImageUrl(imageUrl)
        });
      }
    }
  }

  // Recurse into all object values
  Object.values(data).forEach(val => {
    if (val && typeof val === 'object') {
      extractUberEatsItems(val, results);
    }
  });

  return results;
};

/**
 * Scrape UberEats store page
 */
const scrapeUberEats = async (url: string): Promise<ScrapedItem[]> => {
  console.log('Scraping UberEats URL:', url);

  try {
    const html = await fetchWithProxy(url);
    if (!html || typeof html !== 'string') {
      throw new Error('Failed to fetch UberEats page');
    }

    const scrapedItems: ScrapedItem[] = [];

    // Look for __NEXT_DATA__ script tag (Next.js SSR data)
    const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (nextDataMatch && nextDataMatch[1]) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        console.log('Found __NEXT_DATA__, extracting items...');
        extractUberEatsItems(nextData, scrapedItems);
      } catch (e) {
        console.warn('Failed to parse __NEXT_DATA__:', e);
      }
    }

    // Also look for other embedded JSON data
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script'));

    for (const script of scripts) {
      const content = script.textContent || '';
      // Look for menu-related JSON
      if (content.length > 500 && (
        content.includes('menuItems') ||
        content.includes('itemTitle') ||
        content.includes('catalogSectionsMap') ||
        content.includes('subsectionsMap')
      )) {
        // Try to extract JSON objects from the script
        try {
          // Find valid JSON objects by tracking brace depth
          let depth = 0;
          let startIdx = -1;
          for (let i = 0; i < content.length; i++) {
            if (content[i] === '{') {
              if (depth === 0) startIdx = i;
              depth++;
            } else if (content[i] === '}') {
              depth--;
              if (depth === 0 && startIdx !== -1) {
                try {
                  const jsonStr = content.substring(startIdx, i + 1);
                  if (jsonStr.length > 100) {
                    const parsed = JSON.parse(jsonStr);
                    extractUberEatsItems(parsed, scrapedItems);
                  }
                } catch (e) {}
                startIdx = -1;
              }
            }
          }
        } catch (e) {}
      }
    }

    // Fallback: try DOM-based scraping for visible items
    if (scrapedItems.length === 0) {
      console.log('Falling back to DOM scraping...');
      const images = Array.from(doc.querySelectorAll('img[src*="cloudfront"], img[src*="uber"], img[data-src*="cloudfront"]'));

      images.forEach((img, idx) => {
        const src = img.getAttribute('src') || img.getAttribute('data-src');
        if (!src || src.includes('logo') || src.includes('avatar') || src.length < 20) return;

        // Walk up the DOM to find item name
        let parent = img.parentElement;
        let itemName = '';
        for (let i = 0; i < 8; i++) {
          if (!parent) break;
          const potentialNames = parent.querySelectorAll('h3, h4, [data-testid*="item"], [class*="itemTitle"], [class*="ItemTitle"]');
          for (const el of Array.from(potentialNames)) {
            const text = el.textContent?.trim();
            if (text && text.length > 1 && text.length < 100 && !text.includes('$')) {
              itemName = text;
              break;
            }
          }
          if (itemName) break;
          parent = parent.parentElement;
        }

        if (itemName && src && !scrapedItems.find(item => item.name === itemName)) {
          scrapedItems.push({
            id: `uber-dom-${idx}`,
            name: itemName,
            imageUrl: upscaleImageUrl(src)
          });
        }
      });
    }

    console.log(`Found ${scrapedItems.length} items from UberEats`);
    return scrapedItems;
  } catch (err) {
    console.error('UberEats scraping failed:', err);
    throw err;
  }
};

/**
 * Recursively searches a JSON object for items that look like menu items.
 */
const findItemsInObject = (obj: any, results: ScrapedItem[] = []): ScrapedItem[] => {
  if (!obj || typeof obj !== 'object') return results;

  if (Array.isArray(obj)) {
    obj.forEach(item => findItemsInObject(item, results));
    return results;
  }

  // Check if this object is a menu item based on common Grubtech keys
  const name = obj.name || obj.title || obj.displayName || obj.itemName;
  const id = obj.id || obj.menuItemId || obj.itemId || obj._id || obj.externalId;
  
  let img = obj.imageUrl || obj.image || obj.thumbnailUrl || obj.largeImageUrl;
  
  if (!img && obj.media) {
    if (Array.isArray(obj.media) && obj.media.length > 0) {
      const firstMedia = obj.media[0];
      img = firstMedia.url || firstMedia.imageUrl || firstMedia.image || firstMedia.link;
    } else if (typeof obj.media === 'object') {
      img = obj.media.url || obj.media.imageUrl || obj.media.link;
    } else if (typeof obj.media === 'string') {
      img = obj.media;
    }
  }

  if (name && typeof name === 'string' && img && typeof img === 'string' && img.length > 10) {
    const finalImg = upscaleImageUrl(img.startsWith('//') ? `https:${img}` : img);
    const finalId = id ? id.toString() : `scraped-${results.length}`;

    if (!results.find(i => i.name === name)) {
      results.push({
        id: finalId,
        name: name.trim(),
        imageUrl: finalImg
      });
    }
  }

  // Deep recursion
  Object.values(obj).forEach(val => {
    if (val && typeof val === 'object') {
      findItemsInObject(val, results);
    }
  });

  return results;
};

/**
 * Tries to fetch data using multiple proxy options to bypass CORS and network issues.
 */
const fetchWithProxy = async (targetUrl: string): Promise<any> => {
  try {
    const directResponse = await fetch(targetUrl, { signal: AbortSignal.timeout(3000) });
    if (directResponse.ok) {
      const contentType = directResponse.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await directResponse.json();
      }
      return await directResponse.text();
    }
  } catch (e) {
    console.debug("Direct fetch failed, falling back to proxies...");
  }

  const proxies = [
    { url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}&_=${Date.now()}`, type: 'allorigins' },
    { url: `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`, type: 'direct' },
    { url: `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`, type: 'direct' }
  ];

  for (const proxy of proxies) {
    try {
      const response = await fetch(proxy.url);
      if (!response.ok && response.status !== 304) continue;

      if (proxy.type === 'allorigins') {
        const result = await response.json();
        if (!result.contents) continue;
        try {
          return JSON.parse(result.contents);
        } catch (e) {
          return result.contents;
        }
      } else {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          return await response.json();
        }
        return await response.text();
      }
    } catch (e) {
      console.warn(`Proxy failed: ${proxy.url}`, e);
    }
  }
  throw new Error("Unable to reach the menu source. All retrieval strategies failed. Please check the URL or try again later.");
};

/**
 * Attempts to fetch menu data directly from Grubtech's public API endpoints.
 */
const fetchFromDirectApi = async (menuId: string, locale: string = 'en-us'): Promise<ScrapedItem[]> => {
  const apiPaths = [
    `https://api-gateway.grubtech.io/menu/v1/menus-preview/public/${menuId}?locale=${locale}`,
    `https://api-gateway.grubtech.io/menu/v1/menus/public/${menuId}?locale=${locale}`,
    `https://api.grubtech.io/api/v1/menus/public/${menuId}?locale=${locale}`,
    `https://api-gateway.grubtech.io/menu/v1/menus/${menuId}?locale=${locale}`,
    `https://api.grubtech.io/api/v1/menus/${menuId}?locale=${locale}`
  ];

  for (const baseUrl of apiPaths) {
    try {
      const data = await fetchWithProxy(baseUrl);
      if (!data) continue;

      const items = findItemsInObject(data);
      if (items.length > 0) {
        return items;
      }
    } catch (e) {
      // Continue to next URL
    }
  }
  return [];
};

/**
 * Scrapes menu data from various sources (Grubtech, UberEats, etc.)
 */
export const scrapeMenuPreview = async (url: string): Promise<ScrapedItem[]> => {
  // Check if this is an UberEats URL
  if (isUberEatsUrl(url)) {
    return scrapeUberEats(url);
  }

  // Original Grubtech scraping logic
  let menuId: string | null = null;
  let locale = 'en-us';

  try {
    const urlObj = new URL(url);
    menuId = urlObj.searchParams.get('menuId');
    locale = urlObj.searchParams.get('locale') || 'en-us';
  } catch (e) {
    const idMatch = url.match(/menuId=([a-f0-9-]+)/i);
    if (idMatch) menuId = idMatch[1];
  }

  if (menuId) {
    console.log(`Attempting discovery for menuId: ${menuId}`);
    try {
      const apiItems = await fetchFromDirectApi(menuId, locale);
      if (apiItems.length > 0) return apiItems;
    } catch (e) {
      console.warn("API discovery failed, falling back to HTML scraping...");
    }
  }

  try {
    const html = await fetchWithProxy(url);
    if (!html || typeof html !== 'string') return [];

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const scrapedItems: ScrapedItem[] = [];

    const scripts = Array.from(doc.querySelectorAll('script'));
    for (const script of scripts) {
      const content = script.textContent || '';
      if (content.length > 100 && (content.includes('menuItems') || content.includes('categories') || content.includes('imageUrl'))) {
        const jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
        if (jsonMatch) {
          try {
            const possibleJson = JSON.parse(jsonMatch[0]);
            findItemsInObject(possibleJson, scrapedItems);
          } catch (e) {}
        }
      }
    }

    if (scrapedItems.length > 0) return scrapedItems;

    const images = Array.from(doc.querySelectorAll('img'));
    images.forEach((img, idx) => {
      const src = img.getAttribute('src') || img.getAttribute('data-src');
      if (!src || src.includes('logo') || src.length < 20) return;

      let parent = img.parentElement;
      let itemName = '';
      for (let i = 0; i < 6; i++) {
        if (!parent) break;
        const potentialNames = parent.querySelectorAll('h1, h2, h3, h4, h5, .title, .item-name, .name, [class*="itemName"], [class*="Title"]');
        for (const el of Array.from(potentialNames)) {
          const text = el.textContent?.trim();
          if (text && text.length > 1 && text.length < 100) {
            itemName = text;
            break;
          }
        }
        if (itemName) break;
        parent = parent.parentElement;
      }

      if (itemName && src && !scrapedItems.find(item => item.name === itemName)) {
        scrapedItems.push({
          id: `dom-${idx}`,
          name: itemName,
          imageUrl: upscaleImageUrl(src.startsWith('//') ? `https:${src}` : src)
        });
      }
    });

    return scrapedItems;
  } catch (err) {
    console.error("Scraper failed:", err);
    throw err;
  }
};
