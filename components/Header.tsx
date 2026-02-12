
import React, { useState } from 'react';
import { AppView } from '../types';
import { useAuth } from '../contexts/AuthContext';

interface HeaderProps {
  onToggleSidebar: () => void;
  onNavigate: (view: AppView) => void;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, onNavigate }) => {
  const { user, loading, signInGoogle, signInEmail, signUpEmail, logOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError('');
    await signInGoogle();
    setAuthLoading(false);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');

    if (authMode === 'signup') {
      const result = await signUpEmail(email, password);
      if (result.success) {
        if (result.needsConfirmation) {
          setShowConfirmation(true);
        } else {
          setShowAuthModal(false);
          resetForm();
        }
      } else {
        setAuthError(result.error || 'Sign up failed');
      }
    } else {
      const result = await signInEmail(email, password);
      if (result.success) {
        setShowAuthModal(false);
        resetForm();
      } else {
        setAuthError(result.error || 'Sign in failed');
      }
    }
    setAuthLoading(false);
  };

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setAuthError('');
    setShowConfirmation(false);
  };

  const handleSignOut = async () => {
    await logOut();
    setShowUserMenu(false);
  };

  return (
    <>
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
              onClick={() => setShowAuthModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors text-sm font-medium"
            >
              <i className="fas fa-user"></i>
              <span className="hidden sm:inline">Sign in</span>
            </button>
          )}
        </div>
      </header>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-900">
                {showConfirmation ? 'Check your email' : authMode === 'signin' ? 'Sign in' : 'Create account'}
              </h3>
              <button
                onClick={() => { setShowAuthModal(false); resetForm(); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>

            {showConfirmation ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-envelope text-2xl text-emerald-600"></i>
                </div>
                <p className="text-slate-600 mb-4">
                  We sent a confirmation link to <strong>{email}</strong>. Click the link to activate your account.
                </p>
                <button
                  onClick={() => { setShowAuthModal(false); resetForm(); }}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-medium"
                >
                  Got it
                </button>
              </div>
            ) : (
              <>
                {/* Google Sign In */}
                <button
                  onClick={handleGoogleSignIn}
                  disabled={authLoading}
                  className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium mb-4"
                >
                  <i className="fab fa-google text-red-500 text-lg"></i>
                  Continue with Google
                </button>

                <div className="flex items-center gap-4 mb-4">
                  <div className="flex-1 h-px bg-slate-200"></div>
                  <span className="text-slate-400 text-sm">or</span>
                  <div className="flex-1 h-px bg-slate-200"></div>
                </div>

                {/* Email/Password Form */}
                <form onSubmit={handleEmailAuth} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="you@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="••••••••"
                    />
                  </div>

                  {authError && (
                    <p className="text-red-600 text-sm">{authError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {authLoading ? (
                      <i className="fas fa-spinner fa-spin"></i>
                    ) : authMode === 'signin' ? (
                      'Sign in'
                    ) : (
                      'Create account'
                    )}
                  </button>
                </form>

                <p className="text-center text-sm text-slate-500 mt-4">
                  {authMode === 'signin' ? (
                    <>
                      Don't have an account?{' '}
                      <button
                        onClick={() => { setAuthMode('signup'); setAuthError(''); }}
                        className="text-indigo-600 font-medium hover:underline"
                      >
                        Sign up
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <button
                        onClick={() => { setAuthMode('signin'); setAuthError(''); }}
                        className="text-indigo-600 font-medium hover:underline"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default Header;
