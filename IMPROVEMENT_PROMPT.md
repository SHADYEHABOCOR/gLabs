# Grubtech Labs - Frontend Improvement Prompt

## Context
This is a frontend-only React/TypeScript application for restaurant menu management with AI-powered translation and image processing. The app must remain **100% frontend** with no backend server required.

## Core Principles
1. **Keep it frontend-only** - All processing happens in browser
2. **Maintain current features** - Don't remove existing functionality
3. **Improve code quality** - Fix bugs, improve types, enhance UX
4. **Harden security** - Address API key exposure and validation gaps
5. **Optimize performance** - Reduce sequential operations, improve responsiveness

---

## Priority 1: Critical Security Fixes (MUST FIX)

### 🔴 API Key Exposure
**Current Issue:**
- `.env` file contains exposed API keys (Gemini, BrightData)
- `vite.config.ts` (lines 14-15) bundles API keys into client code
- Anyone with DevTools can extract and abuse keys

**Required Fix:**
1. Create `.env.example` template with placeholder values
2. Add `.env` to `.gitignore` if not already
3. Update `vite.config.ts` to only pass `VITE_` prefixed vars
4. Document in README that API key will be visible to users (acceptable risk for internal tool)
5. Add rate limiting checks in `geminiService.ts` to detect abuse

**Implementation:**
```typescript
// vite.config.ts - REMOVE API_KEY exposure
define: {
  'process.env.VITE_GEMINI_API_KEY': JSON.stringify(process.env.VITE_GEMINI_API_KEY),
  // DO NOT expose non-VITE prefixed vars
}

// geminiService.ts - Add rate limit detection
const handleAPIError = (error: any) => {
  if (error.status === 429) {
    throw new Error('API rate limit exceeded. Please wait before retrying.');
  }
  throw error;
};
```

### 🔴 Input Validation
**Current Issue:**
- No URL validation in `scraperService.ts`
- Accepts any external URL for scraping
- Users could be tricked into scraping malicious sites

**Required Fix:**
```typescript
// services/scraperService.ts - Add domain whitelist
const ALLOWED_DOMAINS = [
  'grubtech.io',
  'api.grubtech.io',
  'api-gateway.grubtech.io',
  'ubereats.com',
  'deliveryhero.io'
];

export const validateMenuUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return ALLOWED_DOMAINS.some(domain =>
      urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
};

// Use before any fetch
export const scrapeMenuPreview = async (url: string): Promise<ScrapedItem[]> => {
  if (!validateMenuUrl(url)) {
    throw new Error('Invalid URL. Only Grubtech and UberEats URLs are allowed.');
  }
  // ... rest of implementation
};
```

---

## Priority 2: Error Handling (HIGH)

### 🟠 Missing Error Boundaries
**Current Issue:**
- React errors crash entire app
- No graceful degradation

**Required Fix:**
```typescript
// components/ErrorBoundary.tsx - NEW FILE
import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-md">
            <h2 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h2>
            <p className="text-slate-600 mb-4">{this.state.error?.message}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// App.tsx - Wrap entire app
<ErrorBoundary>
  <MenuStudioApp onBack={handleBackToDashboard} />
</ErrorBoundary>
```

### 🟠 Improve geminiService Error Handling
**Current Issue:**
- Batch failures don't propagate to UI
- No retry logic for transient failures
- Silent failures leave users confused

**Required Fix:**
```typescript
// services/geminiService.ts - Enhanced error handling
const processBatch = async (
  batch: typeof itemsToTranslate,
  batchIndex: number,
  retryCount = 0
): Promise<void> => {
  const MAX_RETRIES = 3;

  try {
    // ... existing batch processing
  } catch (error: any) {
    console.error(`Batch ${batchIndex + 1} failed:`, error);

    // Retry on transient errors
    if (retryCount < MAX_RETRIES && (error.status === 429 || error.status >= 500)) {
      const delayMs = Math.pow(2, retryCount) * 1000; // Exponential backoff
      console.log(`Retrying batch ${batchIndex + 1} after ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return processBatch(batch, batchIndex, retryCount + 1);
    }

    // Propagate error with context
    throw new Error(
      `Translation batch ${batchIndex + 1}/${batches.length} failed after ${retryCount} retries: ${error.message}`
    );
  }
};
```

### 🟠 TransformerPage Error Handling
**Current Issue:**
- `runTransformation()` has no try-catch
- Errors leave UI in inconsistent state

**Required Fix:**
```typescript
// components/TransformerPage.tsx - Wrap in try-catch
const runTransformation = async (options: TransformOptions) => {
  setIsProcessing(true);
  setAiInsights(null);
  setError(null);
  setProcessingStatus('Analyzing headers...');

  try {
    // ... existing transformation logic
  } catch (err: any) {
    console.error('Transformation failed:', err);
    setError(err.message || 'An unexpected error occurred during transformation.');
  } finally {
    setIsProcessing(false);
    setProcessingStatus('');
    setProcessingProgress({ current: 0, total: 0 });
  }
};
```

---

## Priority 3: Type Safety (HIGH)

### 🟠 Fix Loose Typing
**Current Issue:**
- `any[]` used instead of proper types
- Missing type guards
- Incomplete interfaces

**Required Fix:**
```typescript
// types.ts - Enhanced types
export interface TransformedMenuItem {
  'Menu Item Id': string;
  'Menu Item Name'?: string | null;
  'Menu Item Name[ar-ae]'?: string | null;
  'Description'?: string | null;
  'Description[ar-ae]'?: string | null;
  'Brand Name'?: string | null;
  'Brand Name[ar-ae]'?: string | null;
  'Modifier Group Name'?: string | null;
  'Modifier Group Name[ar-ae]'?: string | null;
  'Modifier Name'?: string | null;
  'Modifier Name[ar-ae]'?: string | null;
  // ... all other fields with explicit types
  _imageSource?: 'database' | 'generated' | 'excel' | 'none';
}

// Type guard
export const isTransformedMenuItem = (item: any): item is TransformedMenuItem => {
  return item && typeof item === 'object' && 'Menu Item Id' in item;
};

// components/TransformerPage.tsx - Use proper types
const [transformedData, setTransformedData] = useState<TransformedMenuItem[] | null>(null);

// Replace all `any[]` with `TransformedMenuItem[]`
```

### 🟠 Add JSDoc Comments
**Required Fix:**
```typescript
// services/geminiService.ts - Document all exports
/**
 * Translates English menu fields to Arabic using Google Gemini AI.
 * Automatically detects already-Arabic content and skips re-translation.
 *
 * @param data - Array of menu items to translate
 * @param onProgress - Optional callback for progress updates (current, total)
 * @returns Promise resolving to translated data and count of items translated
 * @throws Error if API key is missing or API request fails
 */
export const translateMissingArabic = async (
  data: TransformedMenuItem[],
  onProgress?: (current: number, total: number) => void
): Promise<{ data: TransformedMenuItem[], count: number }> => {
  // ...
};
```

---

## Priority 4: Performance Optimization (MEDIUM)

### 🟡 Parallel Image Downloads
**Current Issue:**
- Images downloaded sequentially in `TransformerPage.tsx`
- 100 images = 100 sequential requests (very slow)

**Required Fix:**
```typescript
// components/TransformerPage.tsx - Concurrent downloads with limit
const CONCURRENT_DOWNLOADS = 5;

const downloadImagesWithConcurrency = async (
  items: TransformedMenuItem[],
  onProgress: (current: number, total: number) => void
): Promise<void> => {
  const itemsWithImages = items.filter(item => item['Image URL']);
  const total = itemsWithImages.length;
  let completed = 0;

  // Process in chunks
  for (let i = 0; i < itemsWithImages.length; i += CONCURRENT_DOWNLOADS) {
    const chunk = itemsWithImages.slice(i, i + CONCURRENT_DOWNLOADS);

    await Promise.all(
      chunk.map(async (item) => {
        try {
          const imageUrl = item['Image URL'];
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          // ... process blob
          completed++;
          onProgress(completed, total);
        } catch (error) {
          console.error(`Failed to download image for ${item['Menu Item Name']}:`, error);
          completed++;
          onProgress(completed, total);
        }
      })
    );
  }
};
```

### 🟡 Debounce DB Updates
**Current Issue:**
- `MenuStudioApp.tsx` updates count on every db-updated event
- No debouncing causes excessive re-renders

**Required Fix:**
```typescript
// components/MenuStudioApp.tsx - Add debounce
import { useEffect, useRef } from 'react';

const MenuStudioApp: React.FC<MenuStudioAppProps> = ({ onBack }) => {
  const updateTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    const handleDBUpdate = () => {
      // Clear existing timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      // Debounce for 300ms
      updateTimeoutRef.current = setTimeout(() => {
        updateCount();
      }, 300);
    };

    window.addEventListener('db-updated', handleDBUpdate);
    return () => {
      window.removeEventListener('db-updated', handleDBUpdate);
      if (updateTimeoutRef.current) clearTimeout(updateTimeoutRef.current);
    };
  }, []);

  // ...
};
```

### 🟡 Cache IndexedDB Handle
**Current Issue:**
- `getLocalDB()` called repeatedly for every operation
- Opening DB connection is expensive

**Required Fix:**
```typescript
// services/imageService.ts - Cache DB handle
let cachedDB: IDBDatabase | null = null;
let dbInitPromise: Promise<IDBDatabase> | null = null;

export const getLocalDB = async (): Promise<IDBDatabase> => {
  // Return cached DB if already open
  if (cachedDB && cachedDB.objectStoreNames.length > 0) {
    return cachedDB;
  }

  // Return existing initialization promise if in progress
  if (dbInitPromise) {
    return dbInitPromise;
  }

  // Start new initialization
  dbInitPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbInitPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      cachedDB = request.result;
      dbInitPromise = null;
      resolve(cachedDB);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });

  return dbInitPromise;
};

// Add cleanup function
export const closeDB = () => {
  if (cachedDB) {
    cachedDB.close();
    cachedDB = null;
  }
};
```

---

## Priority 5: Code Organization (MEDIUM)

### 🟡 Extract Constants
**Current Issue:**
- Magic numbers scattered throughout codebase

**Required Fix:**
```typescript
// constants/index.ts - NEW FILE
export const AI_CONFIG = {
  BATCH_SIZE: 25,
  CONCURRENCY: 3,
  MAX_RETRIES: 3,
  MODELS: {
    TRANSLATION: 'gemini-3-flash-preview',
    IMAGE_GENERATION: 'gemini-2.5-flash-image'
  }
} as const;

export const IMAGE_CONFIG = {
  CONCURRENT_DOWNLOADS: 5,
  MAX_SIZE_MB: 10,
  CHUNK_SIZE: 500,
  SUPPORTED_FORMATS: ['jpg', 'jpeg', 'png', 'webp'] as const
} as const;

export const SCRAPER_CONFIG = {
  TIMEOUT_MS: 10000,
  ALLOWED_DOMAINS: [
    'grubtech.io',
    'api.grubtech.io',
    'api-gateway.grubtech.io',
    'ubereats.com',
    'deliveryhero.io'
  ] as const
} as const;

// Use throughout codebase
import { AI_CONFIG } from '../constants';
const batchSize = AI_CONFIG.BATCH_SIZE;
```

### 🟡 Split TransformerPage Component
**Current Issue:**
- 925 lines in single file
- Hard to maintain and test

**Required Fix:**
```typescript
// components/TransformerPage/index.tsx - Main orchestrator
// components/TransformerPage/ConfigPanel.tsx - Configuration options
// components/TransformerPage/DataPreview.tsx - Data table
// components/TransformerPage/SyncModal.tsx - Image sync approval
// components/TransformerPage/hooks/useTransformation.ts - Business logic hook
// components/TransformerPage/types.ts - Component-specific types

// Example hook extraction:
// hooks/useTransformation.ts
export const useTransformation = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [transformedData, setTransformedData] = useState<TransformedMenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTransformation = useCallback(async (options: TransformOptions) => {
    setIsProcessing(true);
    setError(null);

    try {
      // ... transformation logic
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  return {
    isProcessing,
    transformedData,
    error,
    runTransformation
  };
};
```

---

## Priority 6: UX Improvements (MEDIUM)

### 🟡 Better Loading States
**Current Issue:**
- Long operations lack detailed progress feedback
- Users don't know what's happening

**Required Fix:**
```typescript
// components/TransformerPage.tsx - Enhanced progress UI
<div className="space-y-2">
  <div className="flex justify-between text-sm">
    <span className="text-slate-600">{processingStatus}</span>
    <span className="font-medium text-slate-900">
      {processingProgress.total > 0 && (
        `${Math.round((processingProgress.current / processingProgress.total) * 100)}%`
      )}
    </span>
  </div>
  <div className="w-full bg-slate-200 rounded-full h-2">
    <div
      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
      style={{
        width: `${(processingProgress.current / processingProgress.total) * 100}%`
      }}
    />
  </div>
  {processingProgress.total > 0 && (
    <p className="text-xs text-slate-500">
      Processing item {processingProgress.current} of {processingProgress.total}
    </p>
  )}
</div>
```

### 🟡 Add Keyboard Shortcuts
**Required Fix:**
```typescript
// components/MenuStudioApp.tsx - Add keyboard navigation
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    // Ctrl/Cmd + S to export
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (transformedData) downloadExcel();
    }

    // Escape to close modals
    if (e.key === 'Escape') {
      setShowSyncModal(false);
    }
  };

  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, [transformedData]);
```

### 🟡 Improve Accessibility
**Required Fix:**
```typescript
// components/TransformerPage.tsx - Add ARIA labels
<button
  onClick={runTransformation}
  disabled={isProcessing}
  aria-label="Start menu transformation"
  aria-busy={isProcessing}
  className="..."
>
  {isProcessing ? 'Processing...' : 'Transform Data'}
</button>

// Add focus management for modals
const modalRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (showSyncModal && modalRef.current) {
    const firstFocusable = modalRef.current.querySelector('button, input, select');
    if (firstFocusable instanceof HTMLElement) {
      firstFocusable.focus();
    }
  }
}, [showSyncModal]);
```

---

## Priority 7: Data Validation (MEDIUM)

### 🟡 Validate Excel Structure
**Required Fix:**
```typescript
// services/excelService.ts - Add validation
export const validateExcelStructure = (data: any[]): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!Array.isArray(data) || data.length === 0) {
    errors.push('File is empty or invalid format');
    return { valid: false, errors };
  }

  const firstRow = data[0];
  const recognizedColumns = Object.keys(firstRow).filter(key =>
    columnMappings[key.toLowerCase().trim()]
  );

  if (recognizedColumns.length === 0) {
    errors.push('No recognized column headers found. Expected columns: Menu Item Name, Description, Price, etc.');
  }

  if (!recognizedColumns.some(col =>
    ['name', 'item name', 'menu item name', 'title'].includes(col.toLowerCase())
  )) {
    errors.push('Missing required column: Menu Item Name');
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

// Use in TransformerPage
const handleFileUpload = async (file: File) => {
  const data = await readExcelFile(file);
  const validation = validateExcelStructure(data);

  if (!validation.valid) {
    setError(validation.errors.join('\n'));
    return;
  }

  // Proceed with transformation
};
```

### 🟡 Sanitize User Input
**Required Fix:**
```typescript
// utils/sanitize.ts - NEW FILE
export const sanitizeString = (input: string, maxLength = 1000): string => {
  if (!input) return '';

  // Remove control characters except newlines and tabs
  let sanitized = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  return sanitized.trim();
};

export const sanitizeUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    // Only allow http and https
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      throw new Error('Invalid protocol');
    }
    return urlObj.toString();
  } catch {
    throw new Error('Invalid URL format');
  }
};

// Use in excelService
const newItem: TransformedMenuItem = {
  'Menu Item Name': sanitizeString(row['Menu Item Name'], 200),
  'Description': sanitizeString(row['Description'], 1000),
  // ...
};
```

---

## Priority 8: Bug Fixes (LOW-MEDIUM)

### 🟡 Fix Arabic Regex
**Current Issue:**
- Too broad, matches single Arabic characters
- Could match Arabic numerals unintentionally

**Required Fix:**
```typescript
// services/geminiService.ts - Improved regex
const arabicRegex = /[\u0600-\u06FF]{2,}/; // Require at least 2 Arabic chars

// Or more strict:
const hasSignificantArabic = (text: string): boolean => {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const totalChars = text.replace(/\s/g, '').length;
  return arabicChars > 0 && (arabicChars / totalChars) > 0.3; // 30% threshold
};
```

### 🟡 Fix Image Sanitization
**Current Issue:**
- `sanitizeFileName()` creates different keys for similar names
- "Item Name" vs "ItemName" become different

**Required Fix:**
```typescript
// services/imageService.ts - Consistent sanitization
export const sanitizeFileName = (name: string): string => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_') // Replace ALL non-alphanumeric with underscore
    .replace(/_+/g, '_') // Collapse multiple underscores
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
};

export const getDBKey = (itemId: string, itemName: string): string => {
  const sanitizedName = sanitizeFileName(itemName);
  return `img_${itemId}_${sanitizedName}`;
};
```

### 🟡 Fix Price Parsing
**Current Issue:**
- Doesn't handle thousand separators
- Fails silently on invalid formats

**Required Fix:**
```typescript
// services/excelService.ts - Robust price parsing
const parsePrice = (priceStr: string): { currency: string | null; value: number | null } => {
  if (!priceStr) return { currency: null, value: null };

  const str = priceStr.toString().trim();

  // Remove thousand separators (comma, space, apostrophe)
  const cleaned = str.replace(/[,\s']/g, '');

  // Match currency code (3 letters) and number
  const match = cleaned.match(/^([A-Z]{3})\s*([\d.]+)$|^([\d.]+)\s*([A-Z]{3})$/i);

  if (!match) {
    console.warn(`Could not parse price: "${priceStr}"`);
    return { currency: null, value: null };
  }

  const currency = (match[1] || match[4] || '').toUpperCase();
  const valueStr = match[2] || match[3];
  const value = parseFloat(valueStr);

  if (isNaN(value) || value < 0) {
    console.warn(`Invalid price value: "${priceStr}"`);
    return { currency: null, value: null };
  }

  return { currency, value };
};
```

### 🟡 Make Menu Item IDs Globally Unique
**Required Fix:**
```typescript
// services/excelService.ts - UUID-based IDs
import { v4 as uuidv4 } from 'uuid'; // Add uuid package

if (!newItem['Menu Item Id']) {
  newItem['Menu Item Id'] = `auto-${uuidv4()}`; // Globally unique
}
```

---

## Priority 9: Testing Infrastructure (LOW)

### 🟢 Add Basic Tests
**Required Setup:**
```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom
```

**Required Fix:**
```typescript
// services/__tests__/excelService.test.ts - NEW FILE
import { describe, it, expect } from 'vitest';
import { parsePrice, sanitizeFileName } from '../imageService';

describe('excelService', () => {
  describe('parsePrice', () => {
    it('parses standard format', () => {
      expect(parsePrice('AED 25.50')).toEqual({ currency: 'AED', value: 25.50 });
    });

    it('handles thousand separators', () => {
      expect(parsePrice('SAR 1,234.56')).toEqual({ currency: 'SAR', value: 1234.56 });
    });

    it('returns null for invalid input', () => {
      expect(parsePrice('invalid')).toEqual({ currency: null, value: null });
    });
  });
});

// vitest.config.ts - NEW FILE
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true
  }
});
```

---

## Priority 10: Documentation

### 🟢 Add Inline Code Comments
**Required Fix:**
- Add JSDoc to all exported functions
- Document complex algorithms
- Explain non-obvious business logic

### 🟢 Create FAQ Document
```markdown
# FAQ.md - NEW FILE

## Common Issues

### Q: Translation fails with "API rate limit exceeded"
**A:** Google Gemini has usage limits. Wait 1 minute and try again with smaller batch sizes.

### Q: Images not appearing in ZIP download
**A:** Ensure images are accessible URLs. Check browser console for CORS errors.

### Q: Arabic text appears as boxes
**A:** Install Arabic fonts on your system. App uses system fonts for rendering.

### Q: Modifier Mode doesn't translate
**A:** Check that both Modifier Mode AND translation toggles are enabled.

## Best Practices

1. **Before translating large datasets**: Test with 10-20 items first
2. **When scraping images**: Start with single menu, then batch
3. **For modifier groups**: Use dedicated Modifier Mode, not standard transformation

## Performance Tips

- Keep translations under 500 items per batch
- Close other browser tabs when processing images
- Clear IndexedDB if it exceeds 50MB (Settings > Storage)
```

---

## Implementation Checklist

### Phase 1: Security & Critical Bugs (Week 1)
- [ ] Remove API keys from `.env`, create `.env.example`
- [ ] Fix `vite.config.ts` to not expose sensitive vars
- [ ] Add URL validation to scraperService
- [ ] Implement Error Boundary component
- [ ] Add try-catch to all async operations
- [ ] Fix Arabic regex to require 2+ characters
- [ ] Fix image sanitization consistency

### Phase 2: Type Safety & Code Quality (Week 2)
- [ ] Replace all `any` with proper types
- [ ] Add JSDoc comments to all exports
- [ ] Extract magic numbers to constants
- [ ] Split TransformerPage into sub-components
- [ ] Add type guards for data validation
- [ ] Implement `validateExcelStructure()`

### Phase 3: Performance & UX (Week 3)
- [ ] Implement parallel image downloads
- [ ] Add debouncing to DB update listener
- [ ] Cache IndexedDB handle
- [ ] Improve progress indicators
- [ ] Add keyboard shortcuts
- [ ] Enhance accessibility (ARIA labels, focus management)

### Phase 4: Polish & Testing (Week 4)
- [ ] Add retry logic to API calls
- [ ] Implement sanitization utilities
- [ ] Fix price parsing edge cases
- [ ] Write unit tests for services
- [ ] Create FAQ document
- [ ] Update README with troubleshooting

---

## Success Criteria

✅ **Security**: No API keys in source control, all external URLs validated
✅ **Reliability**: Error boundaries prevent crashes, all async operations have error handling
✅ **Performance**: Images download 5x faster, translations complete without hanging
✅ **Code Quality**: No `any` types, all functions documented, components under 300 lines
✅ **UX**: Clear progress feedback, keyboard shortcuts work, accessible to screen readers
✅ **Maintainability**: Modular code, constants extracted, test coverage for critical paths

---

## Non-Goals (Keep Frontend-Only)

❌ **No Backend Server**: Keep all processing client-side
❌ **No Database**: Continue using IndexedDB for storage
❌ **No User Authentication**: Remains single-user desktop app
❌ **No Server-Side Rendering**: Keep as SPA with Vite
❌ **No Native App**: Browser-based only

---

## Questions for Clarification

1. **API Key Security**: Is it acceptable for the Gemini API key to be visible to users in DevTools? (Since this is an internal tool)
2. **Modifier Mode**: Should image generation work in Modifier Mode, or is translation-only intentional?
3. **Browser Support**: Are there specific versions of Chrome/Safari/Firefox that must be supported?
4. **Offline Mode**: Is offline functionality required, or is internet connectivity assumed?
5. **Multi-language UI**: Should the interface itself be translatable to Arabic?

---

## Conclusion

This prompt provides a comprehensive, prioritized roadmap for improving Grubtech Labs while maintaining its frontend-only architecture. Focus on Security (P1) and Error Handling (P2) first, as these have the highest impact on reliability and user trust. Performance and UX improvements (P3-P6) can be implemented iteratively.

The app has a solid foundation but needs hardening for production use. With these improvements, it will be more secure, reliable, performant, and maintainable.
