
import React, { useState, useRef } from 'react';
import {
  Globe,
  Search,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  Plus,
  Image as ImageIcon,
  ExternalLink,
  RefreshCw,
  FileArchive,
  Upload,
  FileSpreadsheet
} from 'lucide-react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { scrapeMenuPreview, ScrapedItem, upscaleImageUrl } from '../services/scraperService';
import { bulkSaveToDB, getDBKey, getLocalDB, convertToJpg } from '../services/imageService';

// Helper function to convert Google Drive link to thumbnail/preview URL
const convertDriveLinkToDirectUrl = (url: string): string => {
  if (!url) return url;

  // Handle various Google Drive URL formats
  const fileIdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch) {
    // Use thumbnail endpoint which works better for images in browser
    return `https://drive.google.com/thumbnail?id=${fileIdMatch[1]}&sz=w1000`;
  }

  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`;
  }

  return url;
};

const ScraperPage: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState('');
  const [isScraping, setIsScraping] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<ScrapedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dbKeys, setDbKeys] = useState<Set<string>>(new Set());

  const handleScrape = async () => {
    if (!url) return;
    setIsScraping(true);
    setError(null);
    setResults([]);

    try {
      const data = await scrapeMenuPreview(url);
      setResults(data);
      if (data.length === 0) setError("No items found. The structure might have changed or the URL is invalid.");

      const db = await getLocalDB();
      setDbKeys(new Set(Object.keys(db)));
    } catch (err: any) {
      setError(`Scraping failed: ${err.message || 'Check your internet connection or URL.'}`);
    } finally {
      setIsScraping(false);
    }
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsScraping(true);
    setError(null);
    setResults([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

      if (jsonData.length === 0) {
        setError("No data found in the Excel file.");
        setIsScraping(false);
        return;
      }

      // Try to find columns that contain image URLs and item names
      const scrapedItems: ScrapedItem[] = [];

      jsonData.forEach((row, index) => {
        // Look for image URL in various possible column names
        let imageUrl = '';
        let itemName = '';
        let itemId = '';

        // Common column names for images
        const imageColumns = ['image', 'imageurl', 'image_url', 'image url', 'photo', 'picture', 'img', 'url', 'link', 'drive', 'drivelink', 'drive link'];
        const nameColumns = ['name', 'item', 'itemname', 'item_name', 'item name', 'title', 'product', 'dish'];
        const idColumns = ['id', 'itemid', 'item_id', 'item id', 'sku', 'code'];

        // Find image URL
        for (const col in row) {
          const colLower = col.toLowerCase().trim();
          if (imageColumns.some(ic => colLower.includes(ic)) && row[col]) {
            imageUrl = String(row[col]).trim();
            // Convert Drive links to direct download URLs
            if (imageUrl.includes('drive.google.com')) {
              imageUrl = convertDriveLinkToDirectUrl(imageUrl);
            }
            break;
          }
        }

        // Find item name
        for (const col in row) {
          const colLower = col.toLowerCase().trim();
          if (nameColumns.some(nc => colLower.includes(nc)) && row[col]) {
            itemName = String(row[col]).trim();
            break;
          }
        }

        // Find item ID
        for (const col in row) {
          const colLower = col.toLowerCase().trim();
          if (idColumns.some(idc => colLower.includes(idc)) && row[col]) {
            itemId = String(row[col]).trim();
            break;
          }
        }

        // If we found an image URL, add to results
        if (imageUrl) {
          scrapedItems.push({
            id: itemId || `item-${index + 1}`,
            name: itemName || `Item ${index + 1}`,
            imageUrl: imageUrl
          });
        }
      });

      if (scrapedItems.length === 0) {
        setError("No image URLs found in the Excel file. Make sure you have a column with 'image', 'url', or 'link' in the header.");
      } else {
        setResults(scrapedItems);
        const db = await getLocalDB();
        setDbKeys(new Set(Object.keys(db)));
      }
    } catch (err: any) {
      setError(`Failed to process Excel file: ${err.message}`);
    } finally {
      setIsScraping(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === results.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(results.map(r => r.id)));
  };

  const handleDownloadZip = async () => {
    const itemsToDownload = selectedIds.size > 0 
      ? results.filter(r => selectedIds.has(r.id))
      : results;

    if (itemsToDownload.length === 0) return;

    setIsZipping(true);
    setZipProgress({ current: 0, total: itemsToDownload.length });

    try {
      const zip = new JSZip();
      const folder = zip.folder("scraped_menu_images");
      const usedFilenames = new Set<string>();

      for (let idx = 0; idx < itemsToDownload.length; idx++) {
        const item = itemsToDownload[idx];
        const imageUrl = item.imageUrl;
        const itemName = item.name || 'item';

        let cleanName = itemName.replace(/[<>:"/\\|?*]/g, '_').trim();
        let fileName = `${cleanName}.jpg`;
        
        let counter = 1;
        while (usedFilenames.has(fileName)) {
          fileName = `${cleanName}_${counter}.jpg`;
          counter++;
        }
        usedFilenames.add(fileName);

        try {
          let jpgBlob: Blob | null = null;
          const proxies = [
            `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(imageUrl)}`,
            `https://api.allorigins.win/get?url=${encodeURIComponent(imageUrl)}`
          ];

          let originalBlob: Blob | null = null;
          for (const proxyUrl of proxies) {
            try {
              const res = await fetch(proxyUrl);
              if (res.ok) {
                if (proxyUrl.includes('allorigins')) {
                  const data = await res.json();
                  if (data.contents) {
                    if (data.contents.startsWith('data:')) {
                      const base64Part = data.contents.split(',')[1];
                      const binary = atob(base64Part);
                      const bytes = new Uint8Array(binary.length);
                      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
                      originalBlob = new Blob([bytes]);
                    } else {
                      const binary = data.contents;
                      const bytes = new Uint8Array(binary.length);
                      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
                      originalBlob = new Blob([bytes]);
                    }
                  }
                } else {
                  originalBlob = await res.blob();
                }
                if (originalBlob) break;
              }
            } catch (e) {
              console.warn(`Proxy ${proxyUrl} failed`, e);
            }
          }

          if (originalBlob) {
            jpgBlob = await convertToJpg(originalBlob);
          }

          if (jpgBlob) {
            folder?.file(fileName, jpgBlob);
          }
        } catch (e) {
          console.error(`Failed to process ${fileName}`, e);
        }

        setZipProgress(prev => ({ ...prev, current: idx + 1 }));
      }

      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `scraped_images_${Date.now()}.zip`;
      link.click();
    } catch (err) {
      console.error("ZIP Generation failed", err);
      alert("Failed to generate image ZIP.");
    } finally {
      setIsZipping(false);
      setZipProgress({ current: 0, total: 0 });
    }
  };

  const handleSyncToLibrary = async () => {
    if (selectedIds.size === 0) return;
    setIsSyncing(true);
    try {
      const payload: Record<string, string> = {};
      results.forEach(item => {
        if (selectedIds.has(item.id)) {
          // Standardized: Only use Name as the primary key to avoid doubling count.
          const nameKey = getDBKey(item.name);
          payload[nameKey] = item.imageUrl;
        }
      });

      await bulkSaveToDB(payload);
      const db = await getLocalDB();
      setDbKeys(new Set(Object.keys(db)));
      setSelectedIds(new Set());
      window.dispatchEvent(new CustomEvent('db-updated'));
    } catch (err) {
      alert("Failed to sync some items.");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-500">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center space-x-4 mb-6">
          <div className="bg-blue-100 p-3 rounded-xl">
            <Globe className="text-blue-600 w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Menu Image Scraper</h2>
            <p className="text-sm text-slate-500">Extract high-res images and item names directly from any public menu link.</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste Menu Preview URL (Grubtech, Talabat, etc.)..."
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
            />
          </div>
          <button
            onClick={handleScrape}
            disabled={isScraping || !url}
            className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-bold transition-all flex items-center justify-center space-x-2 shadow-lg shadow-blue-200 disabled:opacity-50"
          >
            {isScraping ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span>{isScraping ? 'Scraping...' : 'Fetch Items'}</span>
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-px bg-slate-200"></div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Or</span>
          <div className="flex-1 h-px bg-slate-200"></div>
        </div>

        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleExcelUpload}
            className="hidden"
            id="excel-upload"
          />
          <label
            htmlFor="excel-upload"
            className="flex items-center justify-center space-x-2 w-full bg-green-50 hover:bg-green-100 text-green-700 px-6 py-3 rounded-xl font-bold transition-all cursor-pointer border-2 border-green-200 hover:border-green-300"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Upload Excel with Drive Links</span>
          </label>
          <p className="text-xs text-slate-500 mt-2 text-center">
            Upload an Excel file with columns for item names and Google Drive image links
          </p>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-100 rounded-xl flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-red-900">Connection Issue</p>
              <p className="text-xs text-red-700/80 mt-1">{error}</p>
            </div>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center space-x-4">
              <button 
                onClick={selectAll}
                className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
              >
                {selectedIds.size === results.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Found {results.length} Items • {selectedIds.size} Selected
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handleDownloadZip}
                disabled={isZipping || results.length === 0}
                className="flex items-center space-x-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
              >
                {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
                <span>{isZipping ? `Packing ZIP (${zipProgress.current}/${zipProgress.total})...` : 'Download ZIP (JPG)'}</span>
              </button>

              <button
                onClick={handleSyncToLibrary}
                disabled={selectedIds.size === 0 || isSyncing}
                className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md shadow-indigo-200 disabled:opacity-50"
              >
                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                <span>Sync {selectedIds.size} to Local DB</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {results.map((item) => {
              const isInDb = dbKeys.has(getDBKey(item.name));
              const isSelected = selectedIds.has(item.id);
              
              return (
                <div 
                  key={item.id} 
                  onClick={() => toggleSelection(item.id)}
                  className={`group relative bg-white rounded-2xl border transition-all cursor-pointer overflow-hidden ${
                    isSelected ? 'ring-2 ring-blue-600 border-transparent shadow-xl translate-y-[-4px]' : 'border-slate-200 hover:border-blue-300 shadow-sm'
                  }`}
                >
                  <div className="aspect-square bg-slate-100 relative overflow-hidden">
                    {item.imageUrl ? (
                      <img 
                        src={item.imageUrl} 
                        alt={item.name} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <ImageIcon className="w-12 h-12" />
                      </div>
                    )}
                    
                    {isSelected && (
                      <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center">
                        <CheckCircle2 className="text-white w-10 h-10 drop-shadow-lg" />
                      </div>
                    )}

                    {isInDb && (
                      <div className="absolute top-3 right-3 bg-green-500 text-white text-[8px] font-black px-2 py-1 rounded shadow-md uppercase tracking-widest flex items-center">
                        <Database className="w-2.5 h-2.5 mr-1" />
                        In Library
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-white">
                    <h3 className="text-xs font-black text-slate-800 uppercase truncate mb-1" title={item.name}>
                      {item.name}
                    </h3>
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-bold text-slate-400 truncate tracking-tight flex-1">
                        ID: {item.id}
                      </p>
                      <a 
                        href={item.imageUrl} 
                        target="_blank" 
                        rel="noreferrer" 
                        onClick={(e) => e.stopPropagation()}
                        className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {results.length === 0 && !isScraping && !error && (
        <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-slate-300 text-center p-8">
          <div className="bg-slate-50 p-8 rounded-full mb-4">
            <Globe className="w-16 h-16 text-slate-200" />
          </div>
          <h3 className="text-xl font-bold text-slate-700">Paste a Menu Link</h3>
          <p className="text-sm text-slate-500 max-w-sm mt-2">
            Enter a menu preview link (Grubtech, Talabat, etc.) above to automatically sync high-res menu assets to your database.
          </p>
          <div className="mt-8 flex items-center space-x-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
            <span>Powered by Smart DOM Discovery</span>
            <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
            <span>Real-time Sync</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScraperPage;
