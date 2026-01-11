# grubtech Labs

A suite of intelligent tools for restaurant operations including menu management, analytics, inventory, and pricing optimization.

## Overview

grubtech Labs is a frontend-only dashboard that provides access to multiple specialized tools for restaurant operations. The application is designed to be easily deployed to any static hosting platform without requiring a backend server.

## Current Apps

### Menu Studio Pro
A sophisticated tool to clean, format, and transform raw menu item Excel exports into standardized data structures with AI-powered features:
- Smart data transformation with Arabic extraction and title case formatting
- AI translation (English ↔ Arabic) with GCC cultural standards
- Menu image scraper with URL upscaling
- AI image generation for missing visuals
- Local library storage using IndexedDB
- Professional Excel/CSV export with high-quality JPG ZIP downloads

### Coming Soon
- Analytics Dashboard - Real-time insights and performance metrics
- Inventory Manager - Track and manage restaurant inventory
- Price Optimizer - AI-powered pricing recommendations

## Getting Started

### Prerequisites
- Node.js 18+ installed

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The application will start at `http://localhost:3000` (or next available port).

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

## Project Structure

```
grubtech-labs/
├── components/
│   ├── Dashboard.tsx          # Main dashboard with app selection
│   ├── MenuStudioApp.tsx      # Menu Studio Pro application
│   ├── TransformerPage.tsx    # Menu data transformer
│   └── ScraperPage.tsx        # Image scraper tool
├── services/                  # Service layer (image handling, etc.)
├── public/                    # Static assets
│   └── grubtech-logo.png     # grubtech logo
├── App.tsx                    # Main app with routing
├── apps-config.ts            # Apps configuration
├── index.html                # Entry HTML
└── vite.config.ts            # Vite configuration
```

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

## Features

- **Frontend-only**: No backend required, deploy anywhere
- **Fast & Lightweight**: Built with Vite and React 19
- **Modern UI**: Tailwind CSS with Poppins font
- **Modular**: Easy to add new apps
- **Local Storage**: Uses IndexedDB for client-side data
- **AI-Powered**: Google Gemini integration for smart features

## Technology Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Lucide React (Icons)
- Google Gemini AI
- XLSX & JSZip for file processing
- IndexedDB for local storage

## Browser Support

Modern browsers with ES2020+ support:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## License

Private - Internal grubtech Tooling

---

**Built for grubtech Operations • Powered by AI**
