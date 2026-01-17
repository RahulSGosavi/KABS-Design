
import React from 'react';
import { DesignSettings } from '../types';
import { Palette, Layers, Box, Square, X, Bot, Image as ImageIcon } from 'lucide-react';
import { AppView } from '../App';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  settings: DesignSettings;
  onUpdate: (key: keyof DesignSettings, value: string) => void;
  disabled: boolean;
  isOpen: boolean;
  onClose: () => void;
}

const SECTION_TITLE_CLASS = "flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider mb-3";
const OPTION_BTN_CLASS = (active: boolean) => `
  w-full text-left px-3 py-2 rounded-md text-sm transition-all duration-200 border
  ${active 
    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-900/20' 
    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:border-slate-600'}
`;

export const Sidebar: React.FC<SidebarProps> = ({ 
  currentView, 
  onViewChange, 
  settings, 
  onUpdate, 
  disabled, 
  isOpen, 
  onClose 
}) => {
  
  const renderOptionGroup = (title: string, icon: React.ReactNode, options: string[], currentValue: string, settingKey: keyof DesignSettings) => (
    <div className="mb-6 md:mb-8 min-w-[200px] flex-1">
      <div className={SECTION_TITLE_CLASS}>{icon} {title}</div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button key={opt} onClick={() => onUpdate(settingKey, opt)} disabled={disabled} className={OPTION_BTN_CLASS(currentValue === opt)}>
            {opt}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/60 z-40 md:hidden" onClick={onClose} />}
      <div className={`fixed inset-y-0 left-0 z-50 w-full sm:w-80 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300 md:static md:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between shrink-0 h-16">
          <h1 className="text-lg font-bold text-white flex items-center gap-2"><Box className="text-blue-500" size={20} /> KABS Design AI</h1>
          <button onClick={onClose} className="p-2 text-slate-400 md:hidden"><X size={24} /></button>
        </div>

        {/* Navigation Tabs */}
        <div className="p-4 grid grid-cols-2 gap-2 border-b border-slate-800">
           <button 
             onClick={() => { onViewChange('visualizer'); onClose(); }}
             className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${currentView === 'visualizer' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
           >
             <ImageIcon size={20} className="mb-1" />
             <span className="text-xs font-bold">3D Visualizer</span>
           </button>
           <button 
             onClick={() => { onViewChange('pricing'); onClose(); }}
             className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${currentView === 'pricing' ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-750'}`}
           >
             <Bot size={20} className="mb-1" />
             <span className="text-xs font-bold">Pricing Agent</span>
           </button>
        </div>

        {/* Scrollable Content (Only shows settings in Visualizer Mode) */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
          {currentView === 'visualizer' ? (
            <>
              {renderOptionGroup('Cabinet Finish', <Palette size={14} />, ['White', 'Oyster', 'Shoji', 'Pebble', 'Taupe', 'Arctic', 'Slate Blue', 'Naval', 'Saddle', 'Walnut', 'Oak', 'Espresso'], settings.cabinetColor, 'cabinetColor')}
              {renderOptionGroup('Door Style', <Square size={14} />, ['Shaker', 'Flat Panel'], settings.doorStyle, 'doorStyle')}
              {renderOptionGroup('Wall Paint', <Layers size={14} />, ['Pure White', 'Off White', 'Light Gray', 'Beige', 'Soft Blue'], settings.wallColor, 'wallColor')}
              {renderOptionGroup('Countertop', <Box size={14} />, ['White Quartz', 'Black Granite', 'Marble Light', 'Concrete Gray'], settings.countertop, 'countertop')}
            </>
          ) : (
            <div className="text-center text-slate-500 mt-10 p-4">
               <Bot size={40} className="mx-auto mb-4 opacity-20" />
               <p className="text-sm">Pricing Agent Mode Active</p>
               <p className="text-xs mt-2">Upload PDFs and Excel sheets in the main window to start analyzing data.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
