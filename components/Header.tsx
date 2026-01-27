
import React from 'react';
import { AppView } from '../types';

interface HeaderProps {
  onToggleSidebar: () => void;
  onNavigate: (view: AppView) => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onNavigate }) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg md:hidden"
        >
          <i className="fas fa-bars"></i>
        </button>
        <div className="hidden md:flex items-center gap-2 text-slate-400 text-sm">
          <img src="/logo.png" alt="FrameOps" className="w-5 h-5" />
          <span className="font-semibold text-slate-700">FrameOps</span>
          <span className="text-slate-300">|</span>
          <span>AI-Powered SOP Generator</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => onNavigate(AppView.GENERATOR)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors text-sm font-semibold shadow-sm"
        >
          <i className="fas fa-plus"></i>
          <span className="hidden sm:inline">New SOP</span>
        </button>
      </div>
    </header>
  );
};

export default Header;
