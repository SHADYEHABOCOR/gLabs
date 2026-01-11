import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Library,
  Globe,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import TransformerPage from './TransformerPage';
import ScraperPage from './ScraperPage';
import { getLocalDB } from '../services/imageService';

type View = 'transformer' | 'scraper';

interface MenuStudioAppProps {
  onBack: () => void;
}

const MenuStudioApp: React.FC<MenuStudioAppProps> = ({ onBack }) => {
  const [currentView, setCurrentView] = useState<View>('transformer');
  const [dbAssetCount, setDbAssetCount] = useState(0);

  useEffect(() => {
    const updateCount = async () => {
      const db = await getLocalDB();
      // Count unique image assets (values) rather than keys to be more accurate
      const uniqueAssets = new Set(Object.values(db));
      setDbAssetCount(uniqueAssets.size);
    };
    updateCount();

    // Listen for database changes (custom event)
    window.addEventListener('db-updated', updateCount);
    return () => window.removeEventListener('db-updated', updateCount);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={onBack}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div className="bg-blue-600 p-2 rounded-lg shadow-sm">
              <Sparkles className="text-white w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Menu Studio Pro</h1>
              <p className="text-[10px] text-slate-500 font-bold tracking-widest uppercase">grubtech Intelligence</p>
            </div>
          </div>

          <nav className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setCurrentView('transformer')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                currentView === 'transformer'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Transformer</span>
            </button>
            <button
              onClick={() => setCurrentView('scraper')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                currentView === 'scraper'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Globe className="w-4 h-4" />
              <span>Image Scraper</span>
            </button>
          </nav>

          <div className="hidden sm:flex items-center space-x-3">
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Local Library</span>
              <span className="text-xs font-black text-slate-700">{dbAssetCount} Unique Assets</span>
            </div>
            <div className="h-8 w-px bg-slate-200"></div>
            <div className="bg-blue-50 text-blue-600 p-2 rounded-full">
              <Library className="w-4 h-4" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div style={{ display: currentView === 'transformer' ? 'block' : 'none' }}>
          <TransformerPage />
        </div>
        <div style={{ display: currentView === 'scraper' ? 'block' : 'none' }}>
          <ScraperPage />
        </div>
      </main>

      <footer className="bg-white border-t py-4">
        <div className="max-w-7xl mx-auto px-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
          Internal Tooling • Optimized for GCC Menu Management • Built for grubtech Operations
        </div>
      </footer>
    </div>
  );
};

export default MenuStudioApp;
