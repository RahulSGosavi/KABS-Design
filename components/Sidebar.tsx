import React from 'react';
import { DesignSettings, CabinetColor, DoorStyle, WallColor, Countertop } from '../types';
import { Palette, Layers, Box, Square, Settings2, X } from 'lucide-react';

interface SidebarProps {
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

export const Sidebar: React.FC<SidebarProps> = ({ settings, onUpdate, disabled, isOpen, onClose }) => {
  
  const renderOptionGroup = (
    title: string, 
    icon: React.ReactNode, 
    options: string[], 
    currentValue: string, 
    settingKey: keyof DesignSettings
  ) => (
    <div className="mb-6 md:mb-8 min-w-[200px] flex-1">
      <div className={SECTION_TITLE_CLASS}>
        {icon}
        {title}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onUpdate(settingKey, opt)}
            disabled={disabled}
            className={OPTION_BTN_CLASS(currentValue === opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-full sm:w-80 bg-slate-900 border-r border-slate-800 flex flex-col
        transition-transform duration-300 ease-in-out
        md:static md:translate-x-0 md:h-full
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        ${disabled ? 'md:opacity-50 md:pointer-events-none' : 'md:opacity-100'}
      `}>
        
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-slate-800 flex items-center justify-between shrink-0 h-16">
          <h1 className="text-lg md:text-xl font-bold text-white tracking-tight flex items-center gap-2">
             <Box className="text-blue-500" size={20} />
             <span>KABS Design AI</span>
          </h1>
          {/* Close Button (Mobile Only) */}
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white md:hidden"
          >
            <X size={24} />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {renderOptionGroup(
            'Cabinet Finish', 
            <Palette size={14} />,
            ['White', 'Oyster', 'Shoji', 'Pebble', 'Taupe', 'Arctic', 'Slate Blue', 'Naval', 'Saddle', 'Walnut', 'Oak', 'Espresso'],
            settings.cabinetColor,
            'cabinetColor'
          )}

          {renderOptionGroup(
            'Door Style', 
            <Square size={14} />,
            ['Shaker', 'Flat Panel'],
            settings.doorStyle,
            'doorStyle'
          )}

          {renderOptionGroup(
            'Wall Paint', 
            <Layers size={14} />,
            ['Pure White', 'Off White', 'Light Gray', 'Beige', 'Soft Blue'],
            settings.wallColor,
            'wallColor'
          )}

          {renderOptionGroup(
            'Countertop', 
            <Box size={14} />,
            ['White Quartz', 'Black Granite', 'Marble Light', 'Concrete Gray'],
            settings.countertop,
            'countertop'
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-slate-800 text-center hidden md:block shrink-0">
           <p className="text-[10px] text-slate-600">Gemini 2.5 Flash Image Active</p>
        </div>
      </div>
    </>
  );
};