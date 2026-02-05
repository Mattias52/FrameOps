
import React, { useEffect, useState } from 'react';
import { AppView } from '../types';

interface SidebarProps {
  currentView: AppView;
  onViewChange: (view: AppView) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onViewChange, isOpen, onToggle }) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const menuItems = [
    { id: AppView.DASHBOARD, label: 'Dashboard', icon: 'fa-gauge' },
    { id: AppView.GENERATOR, label: 'Create SOP', icon: 'fa-plus-circle' },
    { id: AppView.LIBRARY, label: 'SOP Library', icon: 'fa-book' },
    { id: AppView.API_KEYS, label: 'API Access', icon: 'fa-code' },
    { id: AppView.SUBSCRIPTION, label: 'Subscription', icon: 'fa-credit-card' },
  ];

  const handleNavClick = (view: AppView) => {
    onViewChange(view);
    if (isMobile) onToggle(); // Close sidebar on mobile after selection
  };

  // Mobile: overlay sidebar
  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        {isOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={onToggle}
          />
        )}

        {/* Sidebar */}
        <aside className={`fixed top-0 left-0 h-full bg-slate-900 text-white transition-transform duration-300 flex flex-col w-64 z-50 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="p-4 flex items-center justify-between h-24 border-b border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-20 h-20 rounded-lg flex items-center justify-center flex-shrink-0">
                <img src="/logo.png" alt="FrameOps" className="w-20 h-20" />
              </div>
              <span className="font-bold text-xl tracking-tight">FrameOps</span>
            </div>
            <button onClick={onToggle} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white" aria-label="Close menu">
              <i className="fas fa-times"></i>
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto py-6">
            <ul className="space-y-2 px-3">
              {menuItems.map((item) => (
                <li key={item.id}>
                  <button
                    onClick={() => handleNavClick(item.id)}
                    className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                      currentView === item.id
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <i className={`fas ${item.icon} w-6 text-center text-lg`}></i>
                    <span className="font-medium">{item.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="p-4 border-t border-slate-800">
            <div className="p-3 rounded-xl bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30">
              <div className="flex items-center gap-2 mb-2">
                <i className="fas fa-flask text-emerald-400"></i>
                <span className="text-xs font-semibold text-emerald-300">Beta Access</span>
              </div>
              <p className="text-xs text-slate-400 mb-3">Free during beta period</p>
              <button
                onClick={() => onViewChange(AppView.SUBSCRIPTION)}
                className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Give Feedback
              </button>
            </div>
          </div>
        </aside>
      </>
    );
  }

  // Desktop: standard sidebar
  return (
    <aside className={`bg-slate-900 text-white transition-all duration-300 flex flex-col ${isOpen ? 'w-64' : 'w-20'}`}>
      <div className="p-4 flex items-center gap-1 h-24 border-b border-slate-800 shrink-0">
        <div className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0">
          <img src="/logo.png" alt="FrameOps" className="w-16 h-16" />
        </div>
        {isOpen && <span className="font-bold text-xl tracking-tight">FrameOps</span>}
      </div>

      <nav className="flex-1 overflow-y-auto py-6">
        <ul className="space-y-2 px-3">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onViewChange(item.id)}
                className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all ${
                  currentView === item.id 
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <i className={`fas ${item.icon} w-6 text-center text-lg`}></i>
                {isOpen && <span className="font-medium">{item.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

    </aside>
  );
};

export default Sidebar;
