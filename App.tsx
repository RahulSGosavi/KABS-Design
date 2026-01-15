import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { UploadZone } from './components/UploadZone';
import { generateKitchenRender } from './services/geminiService';
import { DesignSettings, DEFAULT_SETTINGS, RenderState } from './types';
import { RefreshCw, AlertCircle, X, FileText, Settings2, Download } from 'lucide-react';

export default function App() {
  // --- State ---
  const [settings, setSettings] = useState<DesignSettings>(DEFAULT_SETTINGS);
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [floorPlanPreview, setFloorPlanPreview] = useState<string | null>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  // Initialize with a random seed to start
  const [renderState, setRenderState] = useState<RenderState>({
    isLoading: false,
    generatedImage: null,
    error: null,
    seed: Math.floor(Math.random() * 1000000)
  });

  // --- Handlers ---
  const handleFileSelect = (file: File) => {
    setFloorPlanFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setFloorPlanPreview(e.target?.result as string);
      // Reset render state for new file
      setRenderState({ 
        isLoading: false, 
        generatedImage: null, 
        error: null,
        seed: Math.floor(Math.random() * 1000000)
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSettingsUpdate = (key: keyof DesignSettings, value: string) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    // Auto-regenerate on change if we already have a plan
    if (floorPlanPreview) {
      triggerGeneration(newSettings);
    }
  };

  const triggerGeneration = async (currentSettings: DesignSettings) => {
    if (!floorPlanPreview || !floorPlanFile) return;

    setRenderState(prev => ({ ...prev, isLoading: true, error: null }));
    
    // On mobile, close sidebar when generating to show result
    setSidebarOpen(false);

    try {
      // DECISION: Do we generate from scratch (Plan) or refine (Image)?
      // If we have a generated image, we use it as the base to keep geometry stable.
      // If not, we use the floor plan.
      
      const hasPreviousRender = !!renderState.generatedImage;
      
      let inputData = '';
      let inputMime = '';

      if (hasPreviousRender && renderState.generatedImage) {
        // Use previous render for stability
        inputData = renderState.generatedImage.split(',')[1];
        inputMime = 'image/png'; // Generated images are usually png
      } else {
        // Use floor plan for initial build
        inputData = floorPlanPreview.split(',')[1];
        inputMime = floorPlanFile.type;
      }

      const imageUrl = await generateKitchenRender(
        inputData, 
        inputMime, 
        currentSettings, 
        renderState.seed,
        hasPreviousRender // isRefinement flag
      );
      
      setRenderState(prev => ({
        ...prev,
        isLoading: false,
        generatedImage: imageUrl,
        error: null
      }));
    } catch (err: any) {
      console.error(err);
      const errorMessage = err.message || "Generation failed. Please try again.";
      setRenderState(prev => ({
        ...prev,
        isLoading: false,
        // Keep previous image if error occurs during update
        generatedImage: prev.generatedImage, 
        error: errorMessage
      }));
    }
  };

  const resetUpload = () => {
    setFloorPlanFile(null);
    setFloorPlanPreview(null);
    setRenderState({ 
      isLoading: false, 
      generatedImage: null, 
      error: null,
      seed: Math.floor(Math.random() * 1000000) 
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

  // Helper to check if file is PDF
  const isPdf = floorPlanFile?.type === 'application/pdf';

  // --- Renders ---

  return (
    // Changed layout to standard flex row (sidebar is taken out of flow on mobile)
    <div className="flex h-screen bg-slate-950 overflow-hidden text-slate-200 font-sans">
      
      {/* SIDEBAR - Drawer on Mobile, Column on Desktop */}
      <Sidebar 
        settings={settings} 
        onUpdate={handleSettingsUpdate} 
        disabled={renderState.isLoading || !floorPlanPreview}
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden transition-all duration-300">
        
        {/* Header */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 md:px-8 bg-slate-950/50 backdrop-blur-sm z-10 shrink-0">
          <div className="flex items-center gap-3">
             {/* Mobile Sidebar Toggle */}
             <button 
               onClick={() => setSidebarOpen(true)}
               className="p-2 -ml-2 text-slate-400 hover:text-white md:hidden"
             >
               <Settings2 size={24} />
             </button>

            <span className="text-xs md:text-sm font-medium text-slate-400 hidden sm:inline">Project:</span>
            <span className="text-sm font-bold text-white truncate max-w-[150px] sm:max-w-none">
              {floorPlanFile ? floorPlanFile.name : 'New Project'}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
             {renderState.isLoading && (
               <div className="flex items-center gap-2 text-blue-400 text-xs md:text-sm animate-pulse">
                 <RefreshCw size={14} className="animate-spin" />
                 <span className="hidden sm:inline">Processing...</span>
               </div>
             )}
             
             {floorPlanFile && (
               <button 
                onClick={resetUpload}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors"
               >
                 <X size={14} /> <span className="hidden sm:inline">Clear</span>
               </button>
             )}
          </div>
        </header>

        {/* Workspace - Scrollable */}
        <div className="flex-1 p-4 md:p-6 overflow-y-auto overflow-x-hidden flex flex-col items-center justify-start md:justify-center relative bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
          
          {/* Error Message */}
          {renderState.error && (
            <div className="absolute top-4 left-4 right-4 md:top-8 md:left-auto md:right-auto z-50 bg-red-500/10 border border-red-500/50 text-red-200 px-4 py-3 rounded-lg flex items-center gap-3 backdrop-blur-md shadow-xl">
              <AlertCircle size={18} className="shrink-0" />
              <span className="text-xs md:text-sm">{renderState.error}</span>
              <button 
                onClick={() => setRenderState(prev => ({...prev, error: null}))}
                className="ml-auto hover:text-white"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {!floorPlanPreview ? (
            // Upload State - Ensure it centers and fits
            <div className="w-full max-w-xl my-auto">
               <UploadZone onFileSelect={handleFileSelect} />
            </div>
          ) : (
            // Workspace - Full Screen Output Only (Removed Source Plan Split)
            <div className="w-full h-full flex flex-col">
              
              {/* Render Output (Main View) */}
              <div className="w-full flex-1 flex flex-col gap-2 min-h-[350px]">
                 <div className="flex items-center justify-between text-[10px] md:text-xs text-slate-500 uppercase font-bold tracking-wider px-1">
                  <span>AI Render Output</span>
                  
                  {renderState.generatedImage && (
                    <button 
                      onClick={handleDownload}
                      className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 transition-colors bg-blue-500/10 px-2 py-1 rounded-md border border-blue-500/20"
                      title="Download Image"
                    >
                      <Download size={14} />
                      <span className="">Download</span>
                    </button>
                  )}
                </div>
                
                <div className="flex-1 bg-black rounded-xl border border-slate-800 relative overflow-hidden flex items-center justify-center">
                  
                  {renderState.generatedImage ? (
                    <img 
                      src={renderState.generatedImage} 
                      alt="AI Rendered Kitchen" 
                      className={`w-full h-full object-contain transition-opacity duration-700 ${renderState.isLoading ? 'opacity-50 blur-sm scale-105' : 'opacity-100 scale-100'}`}
                    />
                  ) : (
                    <div className="text-center p-8">
                       <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                          <RefreshCw className="text-slate-600" size={32} />
                       </div>
                       <h3 className="text-slate-300 font-medium">Ready to Visualize</h3>
                       <p className="text-slate-500 text-xs md:text-sm mt-2 max-w-xs mx-auto mb-6">
                         Your floor plan is loaded. Click below to generate the initial realistic render.
                       </p>
                       <button 
                        onClick={() => triggerGeneration(settings)}
                        disabled={renderState.isLoading}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-full text-sm font-medium transition-all shadow-lg shadow-blue-900/20"
                       >
                         {renderState.isLoading ? 'Rendering...' : 'Generate Visualization'}
                       </button>
                    </div>
                  )}

                  {/* Loading Overlay */}
                  {renderState.isLoading && renderState.generatedImage && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-black/20 backdrop-blur-[2px]">
                      <div className="bg-slate-900/90 text-white px-4 py-2 rounded-full flex items-center gap-2 shadow-xl border border-slate-700">
                        <RefreshCw size={14} className="animate-spin" />
                        <span className="text-xs font-medium">Updating Finishes...</span>
                      </div>
                    </div>
                  )}
                  
                </div>
              </div>

            </div>
          )}
        </div>
        
        {/* Footer info - Hidden on mobile to save space */}
        <div className="h-8 border-t border-slate-800 bg-slate-950 items-center justify-between px-6 text-[10px] text-slate-600 hidden md:flex shrink-0">
           <span>KABS Design AI Engine v1.0</span>
           <span>Powered by Google Gemini 2.5 Flash Image</span>
        </div>

      </main>
    </div>
  );
}