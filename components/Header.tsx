
import React, { useState } from 'react';
import { AppView } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  onToggleSidebar: () => void;
  onNavigate: (view: AppView) => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onNavigate }) => {
  const { user, loading, signIn, logOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleSignIn = async () => {
    await signIn();
  };

  const handleSignOut = async () => {
    await logOut();
    setShowUserMenu(false);
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-10">
      <div className="flex items-center gap-4">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg md:hidden"
          aria-label="Toggle menu"
        >
          <i className="fas fa-bars"></i>
        </button>
        <div className="hidden md:flex items-center gap-2 text-slate-400 text-sm">
          <img src="/logo.png" alt="FrameOps" className="w-11 h-11" />
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

        {/* User menu */}
        {loading ? (
          <div className="w-10 h-10 rounded-full bg-slate-100 animate-pulse"></div>
        ) : user ? (
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1 rounded-full hover:bg-slate-100 transition-colors"
            >
              {user.user_metadata?.avatar_url ? (
                <img
                  src={user.user_metadata.avatar_url}
                  alt={user.user_metadata.full_name || 'User'}
                  className="w-9 h-9 rounded-full border-2 border-slate-200"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                  {(user.email?.[0] || 'U').toUpperCase()}
                </div>
              )}
            </button>

            {showUserMenu && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowUserMenu(false)}></div>
                <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-30">
                  <div className="px-4 py-3 border-b border-slate-100">
                    <p className="font-semibold text-slate-900 truncate">
                      {user.user_metadata?.full_name || 'User'}
                    </p>
                    <p className="text-sm text-slate-500 truncate">{user.email}</p>
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <i className="fas fa-sign-out-alt"></i>
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button
            onClick={handleSignIn}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium"
          >
            <i className="fab fa-google text-red-500"></i>
            <span className="hidden sm:inline">Sign in</span>
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
