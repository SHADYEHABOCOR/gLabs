
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
 * Scrapes a Grubtech Menu Preview URL using multiple discovery strategies.
 */
export const scrapeMenuPreview = async (url: string): Promise<ScrapedItem[]> => {
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
