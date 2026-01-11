# Grubtech Labs - Deployment Guide

This guide explains how to deploy the Grubtech Labs dashboard to various frontend hosting platforms. Since this is a frontend-only application with no backend, deployment is straightforward.

## Prerequisites

- Node.js 18+ installed locally
- Git repository (optional, but recommended for most platforms)

## Build the Application

Before deploying, build the production version:

```bash
npm install
npm run build
```

This creates a `dist` folder containing the optimized production files.

## Deployment Options

### 1. Vercel (Recommended)

Vercel provides the easiest deployment experience with automatic HTTPS and global CDN.

**Option A: Deploy via CLI**
```bash
npm install -g vercel
vercel
```

**Option B: Deploy via GitHub**
1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your repository
5. Vercel auto-detects Vite configuration
6. Click "Deploy"

**Environment Variables**
In Vercel dashboard, add your environment variable:
- `VITE_GEMINI_API_KEY` = your Google Gemini API key

### 2. Netlify

**Option A: Deploy via CLI**
```bash
npm install -g netlify-cli
npm run build
netlify deploy --prod
```

**Option B: Deploy via GitHub**
1. Push your code to GitHub
2. Go to [netlify.com](https://netlify.com)
3. Click "Add new site" → "Import from Git"
4. Select your repository
5. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
6. Add environment variable `VITE_GEMINI_API_KEY` in Site settings → Environment variables

### 3. GitHub Pages

```bash
npm run build
npx gh-pages -d dist
```

Configure `vite.config.ts` base path:
```typescript
export default defineConfig({
  base: '/your-repo-name/',
  // ... rest of config
})
```

### 4. Cloudflare Pages

**Via GitHub:**
1. Push code to GitHub
2. Go to [Cloudflare Pages](https://pages.cloudflare.com)
3. Connect your repository
4. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Environment variables: `VITE_GEMINI_API_KEY`

**Via CLI:**
```bash
npm install -g wrangler
npm run build
wrangler pages deploy dist
```

### 5. AWS S3 + CloudFront

```bash
# Build the app
npm run build

# Upload to S3
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront cache
aws cloudfront create-invalidation --distribution-id YOUR_ID --paths "/*"
```

### 6. Firebase Hosting

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
npm run build
firebase deploy --only hosting
```

In `firebase.json`:
```json
{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

## Environment Variables

The application requires one environment variable:

- `VITE_GEMINI_API_KEY` - Your Google Gemini API key for AI features

**Local development:** Create a `.env.local` file:
```
VITE_GEMINI_API_KEY=your_api_key_here
```

**Production:** Add the variable through your hosting platform's dashboard.

## Post-Deployment Checklist

- [ ] Verify the dashboard loads correctly
- [ ] Test Menu Studio Pro app launches successfully
- [ ] Confirm AI features work (requires API key)
- [ ] Check that all images and assets load
- [ ] Test on mobile devices
- [ ] Verify the back button returns to dashboard

## Custom Domain Setup

Most platforms support custom domains:

1. **Vercel/Netlify:** Go to domain settings → Add custom domain → Follow DNS instructions
2. **Cloudflare Pages:** Automatically manages DNS if domain is on Cloudflare
3. **GitHub Pages:** Add CNAME file to `public` folder with your domain

## Adding New Apps

To add new apps to the dashboard:

1. Edit `apps-config.ts` and add your app configuration
2. Create a new component in `components/` folder
3. Update `App.tsx` to handle the new route
4. Rebuild and redeploy

Example:
```typescript
// apps-config.ts
{
  id: 'analytics',
  name: 'Analytics Dashboard',
  description: 'Real-time insights...',
  icon: 'BarChart3',
  color: 'purple',
  gradient: 'from-purple-500 to-purple-600',
  category: 'Analytics',
  status: 'active',
  route: '/analytics'
}
```

## Troubleshooting

**Issue:** White screen after deployment
- Check browser console for errors
- Verify `base` path in vite.config.ts
- Ensure all assets are in the `public` folder

**Issue:** API calls failing
- Verify environment variable is set correctly
- Check CORS settings if using external APIs
- Ensure API key has correct permissions

**Issue:** Images not loading
- Images must be in `public` folder
- Use absolute paths like `/logo.png` not `./logo.png`
- Clear CDN cache after redeployment

## Support

For deployment issues, check:
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)
- Platform-specific documentation
- Browser console for error messages
