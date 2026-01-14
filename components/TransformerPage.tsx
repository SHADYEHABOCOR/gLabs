
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  Upload, 
  FileSpreadsheet, 
  Settings2, 
  Play, 
  AlertCircle, 
  Image as ImageIcon,
  Loader2,
  Table as TableIcon,
  Database,
  Sparkles,
  Plus,
  Trash2,
  Library,
  X,
  FileArchive,
  Search,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Edit2,
  ChevronRight
} from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { RawMenuItem, TransformedMenuItem, TransformationStats, TransformOptions } from '../types';
import { transformMenuData, downloadExcel, downloadCSV } from '../services/excelService';
import { getAIInsights, translateMissingArabic, translateArabicToEnglish, estimateCaloriesForItems } from '../services/geminiService';
import { processImageSync, getLocalDB, bulkSaveToDB, removeFromDB, getDBKey, saveToDB, convertToJpg, sanitizeFileName } from '../services/imageService';
import { upscaleImageUrl } from '../services/scraperService';
import { transformModifierData, downloadModifierExcel, downloadModifierCSV } from '../services/modifierService';
import { GoogleGenAI } from "@google/genai";

const Switch: React.FC<{ checked: boolean, onChange: () => void, activeColor?: string }> = ({ checked, onChange, activeColor = "bg-blue-600" }) => (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onChange(); }}
    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${checked ? activeColor : 'bg-slate-200'}`}
    role="switch"
    aria-checked={checked}
  >
    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
  </button>
);

interface PendingAsset { id: string; name: string; data: string; }

interface SyncItem {
  id: string;
  name: string;
  originalItem: TransformedMenuItem;
  status: 'matched' | 'unmatched' | 'manual';
  matchKey: string | null;
  shouldGenerate: boolean;
  previewUrl: string | null;
}

const TransformerPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [rawData, setRawData] = useState<any[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [zipProgress, setZipProgress] = useState({ current: 0, total: 0 });
  const [isSavingAssets, setIsSavingAssets] = useState(false);
  const [assetSavingStatus, setAssetSavingStatus] = useState({ current: 0, total: 0 });
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
  const [transformedData, setTransformedData] = useState<any[] | null>(null);
  const [modifierOutputColumns, setModifierOutputColumns] = useState<string[]>([]);
  const [stats, setStats] = useState<TransformationStats | null>(null);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAssetManagerOpen, setIsAssetManagerOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncQueue, setSyncQueue] = useState<SyncItem[]>([]);
  const [dbAssets, setDbAssets] = useState<Record<string, string>>({});
  const [pendingAssets, setPendingAssets] = useState<PendingAsset[]>([]);
  const [options, setOptions] = useState<TransformOptions>({
    applyTitleCase: true, extractArabic: true, splitPrice: true,
    useStockImages: false, autoTranslate: false, autoTranslateArToEn: false, estimateCalories: false,
    generateAndSyncImages: false, modifiersFormatting: false,
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { refreshLibrary(); }, []);

  const refreshLibrary = async () => {
    const assets = await getLocalDB();
    setDbAssets(assets || {});
    window.dispatchEvent(new CustomEvent('db-updated'));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      if (!uploadedFile.name.endsWith('.xlsx') && !uploadedFile.name.endsWith('.xls') && !uploadedFile.name.endsWith('.csv')) {
        setError("Invalid file format. Please upload an Excel (.xlsx, .xls) or CSV file.");
        return;
      }
      setFile(uploadedFile);
      setError(null);
      setTransformedData(null);
      setModifierOutputColumns([]);
      setStats(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const json = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]) as any[];
          setRawData(json);
        } catch (err) { setError("Failed to parse file."); }
      };
      reader.readAsArrayBuffer(uploadedFile);
    }
  };

  const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newPending: PendingAsset[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const rawName = f.name.substring(0, f.name.lastIndexOf('.')).trim();
      const name = sanitizeFileName(rawName);
      const reader = new FileReader();
      const dataUrl = await new Promise<string>(r => { reader.onload = ev => r(ev.target?.result as string); reader.readAsDataURL(f); });
      newPending.push({ id: Math.random().toString(36).substr(2, 9), name, data: dataUrl });
    }
    setPendingAssets(prev => [...prev, ...newPending]);
    if (assetFileInputRef.current) assetFileInputRef.current.value = '';
  };

  const saveAllPending = async () => {
    if (pendingAssets.length === 0) return;
    setIsSavingAssets(true);
    setAssetSavingStatus({ current: 0, total: pendingAssets.length });
    try {
      const payload: Record<string, string> = {};
      pendingAssets.forEach(a => { if (a.name.trim()) payload[getDBKey(a.name)] = a.data; });
      await bulkSaveToDB(payload, (c, t) => setAssetSavingStatus({ current: c, total: t }));
      await refreshLibrary();
      setPendingAssets([]);
    } catch (err: any) { alert(err.message); } finally { setIsSavingAssets(false); }
  };

  const deleteAsset = async (key: string) => { if (confirm('Delete this asset?')) { await removeFromDB(key); await refreshLibrary(); } };

  const sortDataByVisuals = (data: any[]) => {
    return [...data].sort((a, b) => {
      const aVal = (a['Image URL'] && a['Image URL'].toString().length > 0) ? 1 : 0;
      const bVal = (b['Image URL'] && b['Image URL'].toString().length > 0) ? 1 : 0;
      return bVal - aVal;
    });
  };

  const downloadAllImages = async () => {
    if (!transformedData) return;
    setIsZipping(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("menu_images");
      const itemsWithImages = transformedData.filter(i => 
        i && i['Image URL'] && i['Image URL'].toString().trim().length > 0
      );
      
      setZipProgress({ current: 0, total: itemsWithImages.length });
      const usedFilenames = new Set<string>();

      for (let idx = 0; idx < itemsWithImages.length; idx++) {
        const item = itemsWithImages[idx];
        const url = upscaleImageUrl(item['Image URL'].toString()); 
        const itemName = (item['Menu Item Name'] || 'item').toString();
        
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

          if (url.startsWith('data:image')) {
            jpgBlob = await convertToJpg(url);
          } else if (url.startsWith('http')) {
            let originalBlob: Blob | null = null;
            const proxies = [
              `https://corsproxy.io/?${encodeURIComponent(url)}`,
              `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
              `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`
            ];

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
          }

          if (jpgBlob) {
            folder?.file(fileName, jpgBlob);
          }
        } catch (e) {
          console.error(`Failed to process JPG for ${fileName}`, e);
        }

        setZipProgress(prev => ({ ...prev, current: idx + 1 }));
      }
      
      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(content);
      link.download = `menu_images_jpg_${Date.now()}.zip`;
      link.click();
    } catch (err) {
      console.error("Failed to generate ZIP:", err);
      alert("An error occurred while creating the ZIP folder.");
    } finally {
      setIsZipping(false);
      setZipProgress({ current: 0, total: 0 });
    }
  };

  const runTransformation = async () => {
    if (!rawData) return;
    setIsProcessing(true); setAiInsights(null); setError(null);
    setProcessingStatus('Analyzing headers...');
    try {
      await new Promise(r => setTimeout(r, 600));

      // Handle Modifiers Mode separately
      if (options.modifiersFormatting) {
        setProcessingStatus('Transforming modifier data...');
        const modifierResult = transformModifierData(rawData);
        let modifierData = modifierResult.data;
        let outputColumns = modifierResult.outputColumns;

        if (modifierData.length === 0 && rawData.length > 0) {
          setError("No modifier groups could be identified. Ensure your file contains Modifier Group Template data.");
          setIsProcessing(false); return;
        }

        // Apply translations to modifier data
        let modifierStats = {
          totalRawRows: rawData.length,
          totalItemsProcessed: modifierData.length,
          arabicTranslationsFound: modifierData.filter(r => r['Modifier Group Template Name[ar-ae]'] || r['Modifier Name[ar-ae]']).length,
          autoTranslatedCount: 0,
          autoTranslatedEnCount: 0,
          caloriesEstimatedCount: 0,
          imagesFromDB: 0,
          imagesGenerated: 0,
          currenciesDetected: [],
          anomalies: []
        };

        if (options.autoTranslateArToEn) {
          setProcessingStatus('Translating Ar to En...');
          setProcessingProgress({ current: 0, total: 0 });
          const res = await translateArabicToEnglish(modifierData as any, (current, total) => {
            setProcessingStatus(`Translating Ar to En...`);
            setProcessingProgress(prev => ({
              current: Math.max(prev.current, current),
              total
            }));
          });
          modifierData = res.data as any;
          modifierStats.autoTranslatedEnCount = res.count;
          setProcessingProgress({ current: 0, total: 0 });
        }

        if (options.autoTranslate) {
          setProcessingStatus('Translating En to Ar...');
          setProcessingProgress({ current: 0, total: 0 });
          const res = await translateMissingArabic(modifierData as any, (current, total) => {
            setProcessingStatus(`Translating En to Ar...`);
            setProcessingProgress(prev => ({
              current: Math.max(prev.current, current),
              total
            }));
          });
          modifierData = res.data as any;
          modifierStats.autoTranslatedCount = res.count;
          setProcessingProgress({ current: 0, total: 0 });
        }

        setTransformedData(modifierData);
        setModifierOutputColumns(outputColumns);
        setStats(modifierStats);
        setIsProcessing(false);
        return;
      }

      let { data, stats: newStats } = transformMenuData(rawData, options);

      if (newStats.totalItemsProcessed === 0 && rawData.length > 0) {
        setError("No menu items could be identified. Check your file headers or ensure your sheet contains item data.");
        setIsProcessing(false); return;
      }

      if (options.autoTranslateArToEn) {
        setProcessingStatus('Translating Ar to En...');
        setProcessingProgress({ current: 0, total: 0 });
        const res = await translateArabicToEnglish(data, (current, total) => {
          setProcessingStatus(`Translating Ar to En...`);
          setProcessingProgress(prev => ({
            current: Math.max(prev.current, current),
            total
          }));
        });
        data = res.data;
        newStats.autoTranslatedEnCount = res.count;
        setProcessingProgress({ current: 0, total: 0 });
      }

      if (options.autoTranslate) {
        setProcessingStatus('Translating En to Ar...');
        setProcessingProgress({ current: 0, total: 0 });
        const res = await translateMissingArabic(data, (current, total) => {
          setProcessingStatus(`Translating En to Ar...`);
          setProcessingProgress(prev => ({
            current: Math.max(prev.current, current),
            total
          }));
        });
        data = res.data;
        newStats.autoTranslatedCount = res.count;
        setProcessingProgress({ current: 0, total: 0 });
      }

      if (options.estimateCalories) {
        setProcessingStatus('Calculating Calories...');
        setProcessingProgress({ current: 0, total: 0 });
        const res = await estimateCaloriesForItems(data, (current, total) => {
          setProcessingStatus(`Calculating Calories...`);
          setProcessingProgress(prev => ({
            current: Math.max(prev.current, current),
            total
          }));
        });
        data = res.data;
        newStats.caloriesEstimatedCount = res.count;
        setProcessingProgress({ current: 0, total: 0 });
      }

      if (options.generateAndSyncImages) {
        setProcessingStatus('Preparing Sync Queue...');
        const queue: SyncItem[] = data.map(item => {
          const itemName = item['Menu Item Name'] || '';
          const itemId = item['Menu Item Id'] || '';
          const idKey = getDBKey(itemId.toString());
          const nameKey = getDBKey(itemName);
          
          let status: 'matched' | 'unmatched' = 'unmatched';
          let matchKey = null;
          let previewUrl = null;

          if (dbAssets[idKey]) {
            status = 'matched'; matchKey = idKey; previewUrl = dbAssets[idKey];
          } else if (dbAssets[nameKey]) {
            status = 'matched'; matchKey = nameKey; previewUrl = dbAssets[nameKey];
          }

          return {
            id: itemId.toString() || Math.random().toString(),
            name: itemName,
            originalItem: item,
            status,
            matchKey,
            shouldGenerate: status === 'unmatched',
            previewUrl
          };
        });
        setSyncQueue(queue);
        setIsSyncModalOpen(true);
        setTransformedData(sortDataByVisuals(data));
        setStats(newStats);
      } else {
        const sortedData = sortDataByVisuals(data);
        setTransformedData(sortedData); 
        setStats(newStats);
        if (data.length > 0) getAIInsights(newStats, sortedData.slice(0, 5)).then(setAiInsights);
      }
    } finally { setIsProcessing(false); }
  };

  const executeSync = async () => {
    setIsProcessing(true);
    setIsSyncModalOpen(false);
    setProcessingStatus('Syncing Assets & Generating AI Images...');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const finalData = [...transformedData!];
      let genCount = 0;
      let dbCount = 0;

      for (let i = 0; i < finalData.length; i++) {
        const item = finalData[i];
        const syncControl = syncQueue.find(s => s.id === (item['Menu Item Id'] || '').toString());
        if (!syncControl) continue;

        if (syncControl.status === 'matched' || syncControl.status === 'manual') {
          if (syncControl.matchKey && dbAssets[syncControl.matchKey]) {
            item['Image URL'] = dbAssets[syncControl.matchKey];
            item._imageSource = 'database';
            dbCount++;
          }
        } 
        else if (syncControl.shouldGenerate) {
          try {
            setProcessingStatus(`Generating: ${syncControl.name}...`);
            const prompt = `Generate a photo of ${syncControl.name}.

This must be a clean product photo with absolutely no text, no labels, no logos, no watermarks, no words, no letters, no numbers, no writing of any kind visible anywhere in the image.

Style: Professional food photography, studio lighting, white or neutral background, the food item centered and well-lit, appetizing presentation, high resolution, sharp focus.

${item['Description'] ? `The dish is: ${item['Description']}` : ''}

Important: Show only the finished prepared food. No raw ingredients as decoration. No pork, no alcohol.`;
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash-image',
              contents: { parts: [{ text: prompt }] },
              config: { imageConfig: { aspectRatio: "1:1" } }
            });
            
            const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
            if (part?.inlineData) {
              const base64 = `data:image/png;base64,${part.inlineData.data}`;
              item['Image URL'] = base64;
              item._imageSource = 'generated';
              genCount++;
              await saveToDB(getDBKey(syncControl.name), base64);
            }
          } catch (e) { console.error(e); }
        }
      }

      const sortedFinalData = sortDataByVisuals(finalData);
      setTransformedData(sortedFinalData);
      setStats(prev => prev ? ({
        ...prev,
        imagesFromDB: dbCount,
        imagesGenerated: genCount
      }) : null);
      
      await refreshLibrary();
      if (sortedFinalData.length > 0) getAIInsights(stats!, sortedFinalData.slice(0, 5)).then(setAiInsights);
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  const handleManualMatch = (itemId: string, assetKey: string) => {
    setSyncQueue(prev => prev.map(s => {
      if (s.id === itemId) {
        return {
          ...s,
          status: 'manual',
          matchKey: assetKey,
          previewUrl: dbAssets[assetKey],
          shouldGenerate: false
        };
      }
      return s;
    }));
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center">
              <Upload className="w-4 h-4 mr-2" /> Step 1: File Upload
            </h2>
            <div onClick={() => fileInputRef.current?.click()} className={`relative border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer flex flex-col items-center justify-center text-center ${file ? 'border-blue-300 bg-blue-50' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}>
              <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .csv" onChange={handleFileUpload} />
              <FileSpreadsheet className={`w-10 h-10 mb-3 ${file ? 'text-blue-600' : 'text-slate-400'}`} />
              {file ? (<p className="text-sm font-semibold text-blue-900 truncate max-w-[200px]">{file.name}</p>) : (<p className="text-sm font-medium text-slate-600">Drag & drop raw export</p>)}
            </div>
            {error && <div className="mt-4 p-3 bg-red-50 text-red-700 text-xs font-medium rounded-xl flex items-start"><AlertCircle className="w-4 h-4 mr-2" />{error}</div>}
          </section>

          <section className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center"><Settings2 className="w-4 h-4 mr-2" /> Step 2: Configuration</h2>
            <div className="space-y-3">
              {[
                { label: 'Modifiers Mode', sub: 'Transform modifier group templates', opt: 'modifiersFormatting', badge: 'NEW', color: 'bg-purple-50/50' },
                { label: 'Arabic Extraction', sub: 'Merge rows with [ar-ae] prefix', opt: 'extractArabic' },
                { label: 'Arabic to English', sub: 'Translate content to English', opt: 'autoTranslateArToEn', badge: 'SMART AI', color: 'bg-green-50/50' },
                { label: 'English to Arabic', sub: 'Translate content to Arabic', opt: 'autoTranslate', badge: 'SMART AI', color: 'bg-blue-50/50' },
                { label: 'Estimate Calories', sub: 'Calculate values', opt: 'estimateCalories', badge: 'AI', color: 'bg-orange-50/50' },
                { label: 'Image DB Sync', sub: 'Match by ID or Name', opt: 'generateAndSyncImages', badge: 'SMART', color: 'bg-indigo-50/50' },
                { label: 'Formatting', sub: 'Apply Title Case', opt: 'applyTitleCase' }
              ].map(s => (
                <div key={s.opt} className={`flex items-center justify-between p-3 rounded-lg border border-slate-100 ${s.color || 'bg-slate-50'}`}>
                  <div>
                    <p className={`text-sm font-semibold ${s.badge ? 'text-blue-900' : 'text-slate-700'}`}>{s.label} {s.badge && <span className="ml-1 px-1 bg-blue-100 text-blue-700 rounded text-[8px] font-bold">{s.badge}</span>}</p>
                    <p className="text-[10px] text-slate-500">{s.sub}</p>
                  </div>
                  <Switch checked={(options as any)[s.opt]} onChange={() => setOptions(prev => ({...prev, [s.opt]: !(prev as any)[s.opt]}))} />
                </div>
              ))}
            </div>
          </section>

          <button onClick={runTransformation} disabled={!rawData || isProcessing} className={`w-full rounded-xl font-bold transition-all shadow-lg relative overflow-hidden ${!rawData || isProcessing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {isProcessing ? (
              <div className="py-4 flex flex-col items-center space-y-2">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">{processingStatus}</span>
                </div>
                {processingProgress.total > 0 && (
                  <>
                    <div className="w-3/4 bg-slate-300 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full transition-all duration-500 ease-out rounded-full"
                        style={{ width: `${(processingProgress.current / processingProgress.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs opacity-75">
                      {processingProgress.current}/{processingProgress.total} items ({Math.round((processingProgress.current / processingProgress.total) * 100)}%)
                    </span>
                  </>
                )}
              </div>
            ) : (
              <div className="py-4 flex items-center justify-center space-x-2">
                <Play className="w-5 h-5 fill-current" />
                <span>Transform Menu</span>
              </div>
            )}
          </button>
          
          <button onClick={() => setIsAssetManagerOpen(true)} className="w-full py-3 bg-white border border-slate-200 rounded-xl text-slate-600 text-sm font-bold flex items-center justify-center hover:bg-slate-50 transition-colors">
            <Library className="w-4 h-4 mr-2" /> Asset Library
          </button>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!transformedData ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center bg-white rounded-2xl border border-dashed border-slate-300 text-center p-8">
              <TableIcon className="w-12 h-12 text-slate-300 mb-4" />
              <h3 className="text-lg font-semibold text-slate-700">Awaiting Export File</h3>
              <p className="text-sm text-slate-500 max-w-xs mt-2">Upload your raw menu export to begin transformation.</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                  { l: 'Items', v: stats?.totalItemsProcessed },
                  { l: 'AI En', v: stats?.autoTranslatedEnCount, c: 'text-green-600' },
                  { l: 'AI Ar', v: stats?.autoTranslatedCount, c: 'text-blue-600' },
                  { l: 'Calories', v: stats?.caloriesEstimatedCount, c: 'text-orange-600' },
                  { l: 'DB Assets', v: stats?.imagesFromDB, c: 'text-indigo-600' },
                  { l: 'AI Gen', v: stats?.imagesGenerated, c: 'text-purple-600' }
                ].map((s, i) => (
                  <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">{s.l}</p>
                    <p className={`text-xl font-black ${s.c || 'text-slate-800'}`}>{s.v}</p>
                  </div>
                ))}
              </div>

              {aiInsights && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 flex items-start space-x-4">
                  <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-1" />
                  <div>
                    <h4 className="text-sm font-bold text-indigo-900 mb-1">AI Data Insights</h4>
                    <p className="text-sm text-indigo-800/80 italic">"{aiInsights}"</p>
                  </div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b bg-slate-50/50 flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-700 flex items-center"><TableIcon className="w-4 h-4 mr-2" />Processed Preview</h3>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Visuals Prioritized</div>
                </div>
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[1400px]">
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b">Asset</th>
                        {transformedData[0] && Object.keys(transformedData[0]).filter(k => !k.startsWith('_')).map(key => (
                          <th key={key} className="px-4 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transformedData.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="px-4 py-2 border-r">
                            <div className="relative">
                              {row['Image URL'] ? <img src={row['Image URL']} className="w-12 h-12 object-cover rounded shadow-sm" alt="" /> : <div className="w-12 h-12 bg-slate-50 rounded flex items-center justify-center text-slate-300 border border-dashed"><ImageIcon className="w-5 h-5" /></div>}
                              {row._imageSource === 'generated' && <Sparkles className="absolute -top-1 -right-1 bg-purple-600 text-white rounded-full p-0.5 w-4 h-4" />}
                              {row._imageSource === 'database' && <Database className="absolute -top-1 -right-1 bg-indigo-600 text-white rounded-full p-0.5 w-4 h-4" />}
                            </div>
                          </td>
                          {Object.entries(row).filter(([k]) => !k.startsWith('_')).map(([k, v]: any, vi) => (
                            <td key={vi} className="px-4 py-3 text-sm truncate max-w-[200px] border-r">
                              {v?.toString() || <span className="text-slate-300 italic text-[10px]">empty</span>}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="p-4 bg-slate-50 border-t flex flex-col sm:flex-row gap-4 items-center justify-between">
                  {!options.modifiersFormatting && (
                    <div className="flex items-center space-x-2 text-xs font-medium">
                      <span className="flex items-center"><span className="w-2 h-2 bg-indigo-600 rounded-full mr-1.5" />From DB</span>
                      <span className="flex items-center"><span className="w-2 h-2 bg-purple-600 rounded-full mr-1.5" />Generated</span>
                    </div>
                  )}
                  {options.modifiersFormatting && (
                    <div className="flex items-center space-x-2 text-xs font-medium">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-[10px] font-bold">MODIFIERS MODE</span>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => options.modifiersFormatting ? downloadModifierCSV(transformedData, "modifiers") : downloadCSV(transformedData, "menu")} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50">CSV</button>
                    {!options.modifiersFormatting && (
                      <button onClick={downloadAllImages} disabled={isZipping || !transformedData.some(i => i['Image URL'])} className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold flex items-center disabled:opacity-50 transition-all active:scale-95">
                        {isZipping ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileArchive className="w-4 h-4 mr-2" />}
                        <span>{isZipping ? `Packing ZIP (${zipProgress.current}/${zipProgress.total})...` : 'ZIP Images (JPG)'}</span>
                      </button>
                    )}
                    <button onClick={() => options.modifiersFormatting ? downloadModifierExcel(transformedData, "modifiers", modifierOutputColumns) : downloadExcel(transformedData, "menu")} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold shadow-md shadow-blue-200">Standard Excel</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {isAssetManagerOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b flex justify-between items-center bg-slate-50">
              <div className="flex items-center space-x-3"><Library className="w-6 h-6 text-blue-600" /><h2 className="text-xl font-bold">Image Asset Library</h2></div>
              <button onClick={() => setIsAssetManagerOpen(false)} className="p-2 hover:bg-slate-200 rounded-full"><X className="w-5 h-5 text-slate-500" /></button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-8">
              <section className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-4">
                <div onClick={() => !isSavingAssets && assetFileInputRef.current?.click()} className="w-full p-8 border-2 border-dashed border-slate-300 rounded-xl bg-white flex flex-col items-center justify-center cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50/50">
                  <input type="file" ref={assetFileInputRef} className="hidden" accept="image/*" multiple onChange={handleAssetUpload} />
                  <Upload className="w-8 h-8 text-blue-600 mb-2" />
                  <p className="text-sm font-bold">Bulk Image Upload</p>
                  <p className="text-xs text-slate-400">Match against ID or Name automatically</p>
                </div>
                {pendingAssets.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center"><p className="text-xs font-bold uppercase">Review Queue ({pendingAssets.length})</p><button onClick={saveAllPending} disabled={isSavingAssets} className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-xs font-bold shadow-md">{isSavingAssets ? 'Saving...' : 'Save All'}</button></div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto">
                      {pendingAssets.map(a => (
                        <div key={a.id} className="bg-white p-3 rounded-xl border border-slate-200 flex items-center space-x-3">
                          <img src={a.data} className="w-14 h-14 object-cover rounded-lg" alt="" />
                          <div className="flex-1 min-w-0"><input type="text" value={a.name} onChange={(e) => setPendingAssets(p => p.map(x => x.id === a.id ? {...x, name: e.target.value} : x))} className="w-full text-xs font-bold border-b border-transparent focus:border-blue-300 outline-none bg-transparent" /><p className="text-[9px] text-slate-400 mt-1 uppercase">Key: {getDBKey(a.name)}</p></div>
                          <button onClick={() => setPendingAssets(p => p.filter(x => x.id !== a.id))}><X className="w-4 h-4 text-slate-300 hover:text-red-500" /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
              <section className="space-y-4">
                <h3 className="text-sm font-bold uppercase">Stored Assets ({Object.keys(dbAssets).length})</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {Object.entries(dbAssets).map(([k, v]) => (
                    <div key={k} className="group relative bg-white border border-slate-200 rounded-xl overflow-hidden hover:shadow-lg transition-all">
                      <img src={v} className="w-full h-28 object-cover" alt="" />
                      <div className="p-2 bg-white/95 absolute bottom-0 inset-x-0 border-t opacity-0 group-hover:opacity-100 transition-opacity"><p className="text-[9px] font-bold truncate uppercase">{k.replace('img_', '').replace(/_/g, ' ')}</p></div>
                      <button onClick={() => deleteAsset(k)} className="absolute top-2 right-2 p-1.5 bg-red-100/80 text-red-600 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>,
        document.body
      )}

      {isSyncModalOpen && createPortal(
        <SyncApprovalModal 
          queue={syncQueue} 
          dbAssets={dbAssets}
          onClose={() => setIsSyncModalOpen(false)}
          onConfirm={executeSync}
          onManualMatch={handleManualMatch}
          onToggleGenerate={(id) => setSyncQueue(prev => prev.map(s => s.id === id ? {...s, shouldGenerate: !s.shouldGenerate} : s))}
          onToggleAllGenerate={(val) => setSyncQueue(prev => prev.map(s => ({...s, shouldGenerate: val})))}
        />,
        document.body
      )}
    </div>
  );
};

interface SyncApprovalModalProps {
  queue: SyncItem[];
  dbAssets: Record<string, string>;
  onClose: () => void;
  onConfirm: () => void;
  onManualMatch: (id: string, key: string) => void;
  onToggleGenerate: (id: string) => void;
  onToggleAllGenerate: (val: boolean) => void;
}

const SyncApprovalModal: React.FC<SyncApprovalModalProps> = ({ 
  queue, dbAssets, onClose, onConfirm, onManualMatch, onToggleGenerate, onToggleAllGenerate 
}) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [isPickerOpen, setIsPickerOpen] = useState<string | null>(null);

  const filteredQueue = useMemo(() => {
    const filtered = queue.filter(s => {
      const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase());
      const matchesFilter = filter === 'all' || s.status === filter || (filter === 'matched' && s.status === 'manual');
      return matchesSearch && matchesFilter;
    });

    return [...filtered].sort((a, b) => {
      const aHasImage = !!a.previewUrl;
      const bHasImage = !!b.previewUrl;
      
      if (aHasImage && !bHasImage) return -1;
      if (!aHasImage && bHasImage) return 1;
      
      return a.name.localeCompare(b.name);
    });
  }, [queue, search, filter]);

  const matchedCount = queue.filter(s => s.status === 'matched' || s.status === 'manual').length;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b bg-slate-50 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
              <RefreshCw className="text-white w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Sync & Approval Bridge</h2>
              <p className="text-xs text-slate-500 font-medium">Verify library matches and approve AI generation tasks.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors"><X className="w-5 h-5 text-slate-500" /></button>
        </div>

        <div className="px-6 py-4 bg-white border-b flex flex-col sm:flex-row gap-4 justify-between items-center">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
            <button onClick={() => setFilter('all')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}>All Items ({queue.length})</button>
            <button onClick={() => setFilter('matched')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'matched' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500'}`}>Matched ({matchedCount})</button>
            <button onClick={() => setFilter('unmatched')} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === 'unmatched' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500'}`}>Unmatched ({queue.length - matchedCount})</button>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredQueue.map(item => (
              <div key={item.id} className={`bg-white p-4 rounded-2xl border transition-all ${item.status === 'unmatched' ? 'border-slate-200' : 'border-green-200 shadow-sm'}`}>
                <div className="flex items-center space-x-4">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                    {item.previewUrl ? (
                      <img src={item.previewUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-slate-300" />
                      </div>
                    )}
                    {(item.status === 'matched' || item.status === 'manual') && (
                      <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5">
                        <CheckCircle2 className="w-3 h-3" />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="text-sm font-bold text-slate-800 truncate pr-2" title={item.name}>{item.name}</h4>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${item.status === 'unmatched' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                        {item.status === 'unmatched' ? 'Need Asset' : 'Linked'}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium mb-3 truncate">ID: {item.id}</p>
                    
                    <div className="flex items-center justify-between">
                      <button 
                        onClick={() => setIsPickerOpen(item.id)}
                        className={`flex items-center space-x-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-lg transition-colors ${isPickerOpen === item.id ? 'bg-blue-600 text-white' : 'text-blue-600 bg-blue-50 hover:bg-blue-100'}`}
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>{isPickerOpen === item.id ? 'Selecting...' : 'Manual Match'}</span>
                      </button>

                      {item.status === 'unmatched' && (
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold text-slate-500">Allow AI Generation</span>
                          <Switch checked={item.shouldGenerate} onChange={() => onToggleGenerate(item.id)} activeColor="bg-indigo-600" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {isPickerOpen === item.id && (
                  <div className="mt-4 pt-4 border-t animate-in slide-in-from-top-2 duration-200">
                    <div className="flex justify-between items-center mb-3 px-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Available Library Assets</span>
                      <button onClick={() => setIsPickerOpen(null)} className="text-[10px] font-bold text-red-500 flex items-center hover:underline">
                        <X className="w-3 h-3 mr-1" /> Close Picker
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-h-64 overflow-y-auto p-2 bg-slate-50 rounded-xl border border-slate-200 shadow-inner">
                      {Object.entries(dbAssets).map(([key, value]) => {
                        const displayName = key.replace('img_', '').replace(/_/g, ' ');
                        return (
                          <div 
                            key={key} 
                            onClick={() => { onManualMatch(item.id, key); setIsPickerOpen(null); }}
                            className={`group relative aspect-square rounded-xl overflow-hidden cursor-pointer border-2 shadow-sm transition-all ${item.matchKey === key ? 'border-blue-500 ring-4 ring-blue-100' : 'border-white hover:border-blue-300 hover:shadow-md'}`}
                            title={displayName}
                          >
                            <img src={value} className="w-full h-full object-cover" alt={displayName} />
                            
                            {/* Readable caption label */}
                            <div className="absolute inset-x-0 bottom-0 bg-white/95 backdrop-blur-sm p-1.5 border-t border-slate-100 transform translate-y-1 group-hover:translate-y-0 transition-transform duration-200">
                              <p className="text-[9px] font-black truncate uppercase text-slate-700 leading-tight">
                                {displayName}
                              </p>
                            </div>

                            <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                               <Plus className="text-blue-600 w-6 h-6 drop-shadow-sm bg-white/80 rounded-full p-1" />
                            </div>
                            
                            {item.matchKey === key && (
                              <div className="absolute top-1 right-1 bg-blue-600 text-white p-1 rounded-full shadow-lg">
                                <CheckCircle2 className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="p-6 bg-slate-50 border-t flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase">Toggle AI All</span>
              <Switch checked={queue.every(s => s.status !== 'unmatched' || s.shouldGenerate)} onChange={() => onToggleAllGenerate(!queue.every(s => s.shouldGenerate))} />
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <p className="text-xs font-bold text-slate-600">
              Summary: <span className="text-green-600 font-black">{matchedCount} Match</span> • <span className="text-indigo-600 font-black">{queue.filter(s => s.shouldGenerate).length} Generation</span>
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={onClose} className="px-6 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors">Abort Sync</button>
            <button onClick={onConfirm} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-8 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-blue-200 transition-all active:scale-95">
              <span>Finalize & Sync</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransformerPage;
