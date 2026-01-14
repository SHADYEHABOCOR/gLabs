# Grubtech Labs

A comprehensive suite of intelligent tools for restaurant operations including menu management, image processing, and data transformation with AI-powered capabilities.

## Overview

Grubtech Labs is a frontend-only dashboard providing access to specialized tools for restaurant operations. Built with modern web technologies, it's designed to be easily deployed to any static hosting platform without requiring a backend server.

## Current Tools

### Menu Studio Pro
A sophisticated tool to clean, format, and transform raw menu item Excel exports into standardized data structures with AI-powered features.

#### Key Features

**Data Transformation**
- Smart header detection and column mapping
- Arabic text extraction from `[ar-ae]` formatted rows
- Title case formatting for consistent naming
- Price splitting into multiple currencies (AED, SAR, BHD, QAR, GBP)
- Google Drive image link conversion to direct URLs
- Automatic ID generation for items without identifiers
- Brand Name, Classification, Tag, and Allergen support
- Modifier Group and Modifier Name handling

**Modifier Mode**
- Specialized transformation for Modifier Group Template exports
- Flattens multi-row modifier data into single-row format
- Preserves Arabic translations
- Supports translation features when enabled

**AI-Powered Translation**
- **English to Arabic**: Translates Menu Item Name, Description, Brand Name, Modifier Group Name, and Modifier Name
- **Arabic to English**: Reverse translation with Arabic preservation in `[ar-ae]` columns
- Smart detection: Skips re-translating already Arabic content
- GCC/UAE cultural compliance (Beef Bacon, Turkey Ham substitutions)
- Batch processing with progress tracking
- Consistent terminology across translations
- Handles modifiers: sizes (Small → صغير), volumes (ML → مل), quantities (Pcs → قطع)

**Image Management**
- **Menu Image Scraper**: Extract images from Grubtech or UberEats URLs
  - Multi-strategy UberEats scraping (GraphQL API, Google Cache, ScrapingBee, Archive.org)
  - Store ID extraction and API fallback
  - Image URL upscaling for better quality
- **Image DB Sync**: Match menu items with locally stored images
  - IndexedDB-based local library
  - Match by ID or Name with sanitization
  - Bulk save/remove operations
- **AI Image Generation**: Create missing visuals using Google Gemini
  - Prompt customization
  - JPG conversion and optimization
  - Progress tracking with visual feedback

**Calorie Estimation**
- AI-powered calorie estimation for menu items
- Based on GCC market standards
- Considers ingredients and classifications

**Export Capabilities**
- Excel export with proper column ordering
- CSV export with UTF-8 BOM for Arabic support
- All columns preserved (no empty column removal)
- High-quality JPG image ZIP downloads
- Organized folder structure by category

#### Supported Input Formats

**Standard Menu Items**
```
Menu Item Id, Menu Item Name, Description, Brand Name, Price, Calories
```

**With Arabic Translations**
```
Menu Item Id, Menu Item Name, Description
, [ar-ae]: اسم العنصر, [ar-ae]: الوصف
```

**Modifier Group Templates**
```
Modifier Group Template Id, Modifier Group Template Name, Modifier Id, Modifier Name, Price, Currency
```

**Supported Column Headers** (case-insensitive):
- ID: `id`, `item id`, `menu item id`, `item_id`
- Name: `name`, `item name`, `menu item name`, `title`
- Brand: `brand`, `brand name`, `brand id`
- Description: `description`, `desc`
- Price: `price`, `cost`, `amount`
- External ID: `external id`, `barcode`
- Classification: `classification`, `category`, `type`
- Tag: `tag`, `tags`, `label`
- Allergen: `allergen`, `allergens`
- Routing Label: `routing label`, `station`
- Preparation Time: `preparation time`, `prep time`
- Calories: `calories`, `kcal`, `calories(kcal)`
- Modifier Group: `modifier group`, `modifier group name`
- Modifier: `modifier`, `modifier name`

#### Output Format

All exports follow this standardized column order:
```
Menu Item Id
Menu Item Name, Menu Item Name[ar-ae]
Description, Description[ar-ae]
Brand Id, Brand Name, Brand Name[ar-ae]
Modifier Group Name, Modifier Group Name[ar-ae]
Modifier Name, Modifier Name[ar-ae]
Sub-Modifier Group Name, Sub-Modifier Group Name[ar-ae]
Sub-Modifier Name, Sub-Modifier Name[ar-ae]
External Id, Barcode
Preparation Time
Routing Label Id, Routing Label, Routing Label[ar-ae]
Ingredient, Packaging
Price[BHD], Price[AED], Price[SAR], Price[GBP], Price[QAR]
Classification, Classification[ar-ae]
Allergen, Allergen[ar-ae]
Tag, Tag[ar-ae]
Calories(kcal), Caffeine Content(g), Sodium Content(g), Salt Content(g)
Image URL
```

### Coming Soon
- Analytics Dashboard - Real-time insights and performance metrics
- Inventory Manager - Track and manage restaurant inventory
- Price Optimizer - AI-powered pricing recommendations

## Getting Started

### Prerequisites
- Node.js 18+ installed
- Google Gemini API key (for AI features)

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The application will start at `http://localhost:5173` (Vite default port).

### Build for Production

```bash
npm run build
```

This creates an optimized production build in the `dist` folder.

### Preview Production Build

```bash
npm run preview
```

## Environment Variables

Create a `.env.local` file in the root directory:

```
VITE_GEMINI_API_KEY=your_google_gemini_api_key_here
```

Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey).

## Project Structure

```
grubtech-labs/
├── components/
│   ├── Dashboard.tsx           # Main dashboard with app selection
│   ├── MenuStudioApp.tsx       # Menu Studio Pro application
│   ├── TransformerPage.tsx     # Menu data transformer & AI features
│   └── ScraperPage.tsx         # Image scraper tool
├── services/
│   ├── excelService.ts         # Menu data transformation logic
│   ├── geminiService.ts        # AI translation & calorie estimation
│   ├── imageService.ts         # IndexedDB image library management
│   ├── scraperService.ts       # UberEats & Grubtech image scraping
│   └── modifierService.ts      # Modifier group template transformation
├── types.ts                    # TypeScript type definitions
├── apps-config.ts              # Apps configuration
├── public/
│   └── grubtech-logo.png       # Grubtech logo
├── App.tsx                     # Main app with routing
├── index.html                  # Entry HTML
├── vite.config.ts              # Vite configuration
└── tailwind.config.js          # Tailwind CSS configuration
```

## Key Technologies

**Core**
- React 19 with TypeScript
- Vite for fast development and optimized builds
- Tailwind CSS for styling with Poppins font

**AI & Processing**
- Google Gemini AI (@google/genai)
  - gemini-3-flash-preview model for translations
  - Structured JSON responses with schema validation
  - Batch processing (25 items per batch, 3 concurrent batches)
- XLSX for Excel file processing
- JSZip for image archive creation
- DOMParser for HTML scraping

**Storage & Images**
- IndexedDB for local image library
- Canvas API for image processing
- JPG conversion and optimization

**UI Components**
- Lucide React for icons
- Custom progress indicators
- Drag-and-drop file upload
- Real-time processing status

## Translation Features in Detail

### English to Arabic Translation
- Detects if source is already Arabic and skips AI translation
- Copies Arabic directly to `[ar-ae]` columns
- Translates: Name, Description, Brand Name, Modifier Group, Modifier Name
- Cultural compliance: Beef Bacon (لحم بقري مقدد), Turkey Ham (حبش)
- Modifier standardization: Small → صغير, Medium → متوسط, Large → كبير

### Arabic to English Translation
- Detects Arabic characters in source fields
- Translates Arabic to English
- Preserves original Arabic in `[ar-ae]` columns
- Supports all fields: Name, Description, Brand Name, Modifiers

### Smart Detection
Both translation functions include:
- Arabic regex pattern matching (`/[\u0600-\u06FF]/`)
- Field-by-field language detection
- Empty field handling (no translation for empty content)
- Progress callbacks for UI updates

## Adding New Apps

1. **Update apps configuration** (`apps-config.ts`):
```typescript
{
  id: 'your-app-id',
  name: 'Your App Name',
  description: 'App description...',
  icon: 'IconName',
  color: 'blue',
  gradient: 'from-blue-500 to-blue-600',
  category: 'Category Name',
  status: 'active',
  route: '/your-app'
}
```

2. **Create your app component** in `components/`:
```typescript
import React from 'react';

interface YourAppProps {
  onBack: () => void;
}

const YourApp: React.FC<YourAppProps> = ({ onBack }) => {
  return (
    <div>
      {/* Your app UI */}
    </div>
  );
};

export default YourApp;
```

3. **Update routing** in `App.tsx`:
```typescript
import YourApp from './components/YourApp';

// Add new route type
type AppRoute = 'dashboard' | 'menu-studio' | 'your-app';

// Handle route in component
{currentRoute === 'your-app' && (
  <YourApp onBack={handleBackToDashboard} />
)}
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions for various platforms:
- Vercel (Recommended)
- Netlify
- GitHub Pages
- Cloudflare Pages
- AWS S3 + CloudFront
- Firebase Hosting

### Quick Deploy to Vercel

```bash
npm run build
vercel --prod
```

## Features Overview

- **Frontend-only**: No backend required, deploy anywhere
- **Fast & Lightweight**: Built with Vite and React 19
- **Modern UI**: Tailwind CSS with professional design
- **Modular**: Easy to add new apps and features
- **Local Storage**: IndexedDB for client-side image library
- **AI-Powered**: Google Gemini integration for smart features
- **Batch Processing**: Efficient handling of large datasets
- **Progress Tracking**: Real-time feedback on long operations
- **Error Handling**: Graceful failures with user-friendly messages
- **Multi-format Support**: Excel, CSV export with proper encoding

## Browser Support

Modern browsers with ES2020+ support:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Performance

- Batch size: 25 items per translation batch
- Concurrency: 3 parallel batches
- Image processing: Client-side canvas rendering
- File operations: Streaming for large files
- IndexedDB: Efficient storage for thousands of images

## Known Limitations

- AI translation requires Google Gemini API key
- UberEats scraping may be affected by site changes
- Browser storage limits apply to IndexedDB (usually 50-100MB+)
- Large image ZIP downloads may take time depending on count

## Troubleshooting

**Translation not working**
- Check if `VITE_GEMINI_API_KEY` is set in `.env.local`
- Verify API key is valid in Google AI Studio
- Check browser console for API errors

**Images not loading**
- Verify IndexedDB is enabled in browser
- Check browser storage quota
- Clear IndexedDB and re-import images

**Excel upload fails**
- Ensure file is .xlsx or .xls format
- Check file size (< 10MB recommended)
- Verify headers match expected format

**UberEats scraping fails**
- Try different proxy strategies (built into scraper)
- Check if store URL is correct format
- Verify store ID extraction

## License

Private - Internal Grubtech Tooling

## Support

For issues or questions, contact the Grubtech development team.

---

**Built for Grubtech Operations • Powered by Google Gemini AI**
