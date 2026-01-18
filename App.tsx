import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { UploadZone } from './components/UploadZone';
import { PricingAI } from './components/PricingAI';
import { generateKitchenRender } from './services/geminiService';
import { fileParser } from './services/fileParser';
import { DesignSettings, DEFAULT_SETTINGS, RenderState } from './types';
import { RefreshCw, AlertCircle, X, Settings2, Download } from 'lucide-react';

export type AppView = 'visualizer' | 'pricing';

export default function App() {
  // --- State ---
  const [currentView, setCurrentView] = useState<AppView>('visualizer');
  const [settings, setSettings] = useState<DesignSettings>(DEFAULT_SETTINGS);
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [floorPlanPreview, setFloorPlanPreview] = useState<string | null>(null);
  
  // New State to hold extracted text from PDF to help AI detect "Island" labels
  const [floorPlanText, setFloorPlanText] = useState<string>(""); 

  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  const [renderState, setRenderState] = useState<RenderState>({
    isLoading: false,
    generatedImage: null,
    error: null,
    seed: 0
  });

  // --- Handlers ---
  const handleFileSelect = async (file: File) => {
    setFloorPlanFile(file);
    
    // CRITICAL FIX: Generate a STABLE seed based on the file content.
    const stableSeed = file.name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) + file.size;

    setRenderState(prev => ({ 
      isLoading: true, // Show loading immediately
      generatedImage: null, 
      error: null,
      seed: stableSeed 
    }));

    try {
      let previewData = '';
      let extractedText = '';
      
      if (file.type === 'application/pdf') {
        // 1. Convert PDF to Image for Vision Model
        previewData = await fileParser.pdfToImage(file);
        // 2. Extract Text for "Island" keyword detection
        extractedText = await fileParser.pdfToText(file);
      } else {
        // Standard Image Read
        previewData = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        extractedText = ""; // OCR not implemented for raw images client-side
      }

      setFloorPlanPreview(previewData);
      setFloorPlanText(extractedText);
      setRenderState(prev => ({ ...prev, isLoading: false }));

    } catch (err: any) {
      console.error(err);
      setRenderState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: "Failed to process file. If it's a PDF, ensure it's valid." 
      }));
    }
  };

  const handleSettingsUpdate = (key: keyof DesignSettings, value: string) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    // When settings change, we want to update the render, but keep the seed stable 
    // to ensure we are just changing materials on the same geometry.
    if (floorPlanPreview && currentView === 'visualizer') {
      triggerGeneration(newSettings, renderState.seed);
    }
  };

  // Helper to manually regenerate with a NEW random seed (if user wants a variation)
  const handleRegenerateRandom = () => {
    const newRandomSeed = Math.floor(Math.random() * 10000000);
    setRenderState(prev => ({ ...prev, seed: newRandomSeed }));
    triggerGeneration(settings, newRandomSeed);
  };

  const triggerGeneration = async (currentSettings: DesignSettings, seedToUse: number) => {
    if (!floorPlanPreview || !floorPlanFile) return;

    setRenderState(prev => ({ ...prev, isLoading: true, error: null, seed: seedToUse }));
    setSidebarOpen(false);

    try {
      const hasPreviousRender = !!renderState.generatedImage;
      let inputData = '';
      let inputMime = '';

      if (hasPreviousRender && renderState.generatedImage) {
        // Use previous render for refinement
        inputData = renderState.generatedImage.split(',')[1];
        inputMime = 'image/png';
      } else {
        // Use original floor plan (which is now ALWAYS an image string, even if source was PDF)
        inputData = floorPlanPreview.split(',')[1];
        // Ensure we send the correct mime type for the vision model
        inputMime = floorPlanPreview.startsWith('data:image/png') ? 'image/png' : 'image/jpeg';
      }

      const imageUrl = await generateKitchenRender(
        inputData, 
        inputMime, 
        currentSettings, 
        seedToUse,
        floorPlanText, // Pass the extracted text context
        hasPreviousRender
      );
      
      setRenderState(prev => ({
        ...prev,
        isLoading: false,
        generatedImage: imageUrl,
        error: null
      }));
    } catch (err: any) {
      console.error(err);
      setRenderState(prev => ({
        ...prev,
        isLoading: false,
        generatedImage: prev.generatedImage, 
        error: err.message || "Generation failed."
      }));
    }
  };

  const resetUpload = () => {
    setFloorPlanFile(null);
    setFloorPlanPreview(null);
    setFloorPlanText("");
    setRenderState({ 
      isLoading: false, 
      generatedImage: null, 
      error: null,
      seed: 0
    });
  };

  const handleDownload = () => {
    if (renderState.generatedImage) {
      const link = document.createElement('a');
      link.href = renderState.generatedImage;
      link.download = `kabs-design-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200 font-sans">
      
      <Sidebar 
        currentView={currentView}
        onViewChange={setCurrentView}
        settings={settings} 
        onUpdate={handleSettingsUpdate} 
        disabled={renderState.isLoading || !floorPlanPreview}
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
        
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 md:px-8 bg-slate-950/50 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-3">
             <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 text-slate-400 hover:text-white md:hidden">
               <Settings2 size={24} />
             </button>
            <span className="text-sm font-bold text-white">
              {currentView === 'visualizer' ? (floorPlanFile ? floorPlanFile.name : '3D Visualizer') : 'Pricing & Design Agent'}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
             {renderState.isLoading && (
               <div className="flex items-center gap-2 text-blue-400 text-xs md:text-sm animate-pulse">
                 <RefreshCw size={14} className="animate-spin" />
                 <span className="hidden sm:inline">Processing...</span>
               </div>
             )}
             
             {currentView === 'visualizer' && floorPlanFile && (
               <button onClick={resetUpload} className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors">
                 <X size={14} /> <span className="hidden sm:inline">Clear Project</span>
               </button>
             )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
          
          {/* PRICING AI VIEW */}
          {currentView === 'pricing' && (
            <div className="h-full w-full">
              <PricingAI />
            </div>
          )}

          {/* VISUALIZER VIEW */}
          {currentView === 'visualizer' && (
             <div className="h-full w-full p-4 md:p-6 overflow-y-auto flex flex-col items-center">
                {renderState.error && (
                  <div className="w-full max-w-3xl mb-4 bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg flex items-center gap-3">
                    <AlertCircle size={18} />
                    <span className="text-sm">{renderState.error}</span>
                  </div>
                )}

                {!floorPlanPreview ? (
                  <div className="w-full max-w-xl my-auto">
                     <UploadZone onFileSelect={handleFileSelect} />
                  </div>
                ) : (
                  <div className="w-full max-w-6xl h-full flex flex-col">
                     <div className="flex items-center justify-between text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider px-1 mb-2">
                        <span>AI Render Output</span>
                        <div className="flex items-center gap-2">
                          {/* Add specific regenerate button for variations */}
                          {renderState.generatedImage && (
                            <button onClick={handleRegenerateRandom} disabled={renderState.isLoading} className="flex items-center gap-1.5 text-slate-400 hover:text-white bg-slate-800 px-2 py-1 rounded-md border border-slate-700">
                              <RefreshCw size={14} /> Regenerate Variation
                            </button>
                          )}
                          {renderState.generatedImage && (
                            <button onClick={handleDownload} className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 bg-blue-500/10 px-2 py-1 rounded-md border border-blue-500/20">
                              <Download size={14} /> Download
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 bg-black rounded-xl border border-slate-800 relative overflow-hidden flex items-center justify-center min-h-[400px]">
                        {renderState.generatedImage ? (
                          <img 
                            src={renderState.generatedImage} 
                            alt="AI Rendered Kitchen" 
                            className={`w-full h-full object-contain transition-opacity duration-700 ${renderState.isLoading ? 'opacity-50 blur-sm' : 'opacity-100'}`}
                          />
                        ) : (
                          <div className="text-center p-8">
                             <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                                <RefreshCw className="text-slate-600" size={32} />
                             </div>
                             <h3 className="text-slate-300 font-medium">Ready to Visualize</h3>
                             <button onClick={() => triggerGeneration(settings, renderState.seed)} disabled={renderState.isLoading} className="mt-6 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full text-sm font-medium shadow-lg">
                               {renderState.isLoading ? 'Rendering...' : 'Generate Visualization'}
                             </button>
                          </div>
                        )}
                      </div>
                  </div>
                )}
             </div>
          )}
        </div>
      </main>
    </div>
  );
}