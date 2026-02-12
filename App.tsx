
import React, { useState, useEffect } from 'react';
import { AppView, SOP } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import SOPGenerator from './components/SOPGenerator';
import LiveSOPGenerator from './components/LiveSOPGenerator';
import SOPLibrary from './components/SOPLibrary';
import SubscriptionPlans from './components/SubscriptionPlans';
import ErrorBoundary from './components/ErrorBoundary';
import LandingPage from './components/LandingPage';
import CreatorLandingPage from './components/CreatorLandingPage';
import APIKeysPage from './components/APIKeysPage';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import { fetchSOPsList, fetchSOPSteps, saveSOP, isSupabaseConfigured } from './services/supabaseService';
import { getSubscriptionStatus, checkPaymentStatus, getSOPUsage, incrementSOPUsage } from './services/stripeService';
import { useAuth } from './contexts/AuthContext';

const FREE_SOP_LIMIT = 3;
const IS_BETA = true; // Set to false when launching paid plans

const App: React.FC = () => {
  const { user, signIn } = useAuth();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // Check if user has entered the app before
  const hasVisited = typeof window !== 'undefined' && window.localStorage.getItem('frameops_visited');

  // Track free SOPs used (only matters after beta)
  const [sopsUsed, setSopsUsed] = useState(getSOPUsage);
  const freeSOPsRemaining = Math.max(0, FREE_SOP_LIMIT - sopsUsed);

  // Pro status: During beta everyone is Pro, after beta check Stripe subscription
  const [subscriptionChecked, setSubscriptionChecked] = useState(false);
  const [stripeIsPro, setStripeIsPro] = useState(false);
  const isPro = IS_BETA || stripeIsPro;

  // Check for payment success/cancelled on page load
  useEffect(() => {
    const paymentStatus = checkPaymentStatus();
    if (paymentStatus === 'success') {
      setStripeIsPro(true);
      // Show success message
      alert('Betalning genomförd! Du har nu Pro-tillgång.');
    } else if (paymentStatus === 'cancelled') {
      // User cancelled - no action needed
    }

    // Check subscription status from localStorage
    const { isPro: storedIsPro } = getSubscriptionStatus();
    setStripeIsPro(storedIsPro);
    setSubscriptionChecked(true);
  }, []);
  const [currentView, setCurrentView] = useState<AppView>(hasVisited ? AppView.DASHBOARD : AppView.LANDING);
  const [sops, setSops] = useState<SOP[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [selectedSopId, setSelectedSopId] = useState<string | null>(null);

  // Start with sidebar closed on mobile
  const [isSidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  // Load SOPs from Supabase (or localStorage fallback) - LAZY LOADING
  const [totalSops, setTotalSops] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const INITIAL_LOAD = 20;

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      if (isSupabaseConfigured()) {
        // Load from Supabase - only metadata first (no steps)
        console.log('Loading SOPs from Supabase (lazy)...');
        const { sops: cloudSops, total } = await fetchSOPsList(INITIAL_LOAD, 0);
        setSops(cloudSops);
        setTotalSops(total);
        setHasMore(cloudSops.length < total);
      } else {
        // Fallback to localStorage
        console.log('Supabase not configured, using localStorage');
        const savedSops = (window as any).localStorage.getItem('sop_stream_data');
        if (savedSops) {
          setSops(JSON.parse(savedSops));
        }
      }

      setIsLoading(false);
    };

    loadData();
  }, [user]); // Reload SOPs when user changes (login/logout)

  // Load more SOPs (pagination)
  const loadMoreSOPs = async () => {
    if (!hasMore || isLoading) return;

    const { sops: moreSops, total } = await fetchSOPsList(INITIAL_LOAD, sops.length);
    setSops(prev => [...prev, ...moreSops]);
    setHasMore(sops.length + moreSops.length < total);
  };

  const handleAddSOP = async (newSop: SOP) => {
    // Track SOP usage (for freemium limit after beta)
    const newCount = incrementSOPUsage();
    setSopsUsed(newCount);

    // Extract video blob before adding to state (blob is only for upload)
    const videoBlob = newSop.videoBlob;
    const sopWithoutBlob = { ...newSop, videoBlob: undefined };

    // Optimistically update UI
    const updated = [sopWithoutBlob, ...sops];
    setSops(updated);

    if (isSupabaseConfigured()) {
      // Save to Supabase (with video blob for live recordings)
      setSyncStatus('saving');
      const result = await saveSOP(sopWithoutBlob, videoBlob);
      if (result.success) {
        // Update the SOP with the database-generated ID and video URL
        if (result.id || result.videoUrl) {
          setSops(prev => prev.map(s =>
            s.id === newSop.id ? {
              ...s,
              id: result.id || s.id,
              videoUrl: result.videoUrl || s.videoUrl
            } : s
          ));
        }
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
      } else if (result.requiresLogin) {
        // User not logged in - show login prompt
        setShowLoginPrompt(true);
        setSyncStatus('idle');
      } else {
        setSyncStatus('error');
        console.error('Failed to save to Supabase');
      }
    } else {
      // Fallback: Save to localStorage without thumbnails or video
      try {
        const toSave = updated.map(sop => ({
          ...sop,
          videoBlob: undefined,
          videoUrl: undefined, // Can't store video in localStorage
          steps: sop.steps.map(step => ({ ...step, thumbnail: undefined }))
        }));
        (window as any).localStorage.setItem('sop_stream_data', JSON.stringify(toSave));
      } catch (e) {
        console.warn('localStorage quota exceeded, clearing old data');
        (window as any).localStorage.removeItem('sop_stream_data');
      }
    }
  };

  const handleEnterApp = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('frameops_visited', 'true');
    }
    setCurrentView(AppView.DASHBOARD);
  };

  const renderView = () => {
    switch (currentView) {
      case AppView.LANDING:
        return <LandingPage onNavigate={setCurrentView} onGetStarted={handleEnterApp} />;
      case AppView.DASHBOARD:
        return <Dashboard sops={sops} onNavigate={setCurrentView} />;
      case AppView.GENERATOR:
        return (
          <ErrorBoundary>
            <SOPGenerator
              onComplete={handleAddSOP}
              onLiveMode={() => setCurrentView(AppView.LIVE_GENERATOR)}
              onNavigateToLibrary={() => setCurrentView(AppView.LIBRARY)}
              onOpenSOP={(sopId) => {
                setSelectedSopId(sopId);
                setCurrentView(AppView.LIBRARY);
              }}
              freeSOPsRemaining={freeSOPsRemaining}
              isPro={isPro}
              onUpgrade={() => setCurrentView(AppView.SUBSCRIPTION)}
            />
          </ErrorBoundary>
        );
      case AppView.LIVE_GENERATOR:
        return (
          <ErrorBoundary>
            <LiveSOPGenerator
              onComplete={(sop) => {
                handleAddSOP(sop);
                setCurrentView(AppView.LIBRARY);
              }}
              onCancel={() => setCurrentView(AppView.GENERATOR)}
              freeSOPsRemaining={freeSOPsRemaining}
              isPro={isPro}
              onUpgrade={() => setCurrentView(AppView.SUBSCRIPTION)}
            />
          </ErrorBoundary>
        );
      case AppView.LIBRARY:
        return (
          <SOPLibrary
            sops={sops}
            onDelete={(sopId) => setSops(prev => prev.filter(s => s.id !== sopId))}
            onUpdate={(updatedSop) => setSops(prev => prev.map(s => s.id === updatedSop.id ? updatedSop : s))}
            isPro={isPro}
            initialSelectedId={selectedSopId}
            onSelectionCleared={() => setSelectedSopId(null)}
            onUpgrade={() => setCurrentView(AppView.SUBSCRIPTION)}
            onLoadMore={loadMoreSOPs}
            hasMore={hasMore}
            fetchSteps={fetchSOPSteps}
          />
        );
      case AppView.SUBSCRIPTION:
        return <SubscriptionPlans />;
      case AppView.API_KEYS:
        return <APIKeysPage />;
      default:
        return <Dashboard sops={sops} onNavigate={setCurrentView} />;
    }
  };

  // Landing page - show without app chrome
  if (currentView === AppView.LANDING) {
    return <LandingPage onNavigate={setCurrentView} onGetStarted={handleEnterApp} />;
  }

  // Creator landing page - show without app chrome
  if (currentView === AppView.CREATOR_LANDING) {
    return <CreatorLandingPage onNavigate={setCurrentView} onGetStarted={handleEnterApp} />;
  }

  // Privacy page - show without app chrome
  if (currentView === AppView.PRIVACY) {
    return <PrivacyPage onNavigate={setCurrentView} />;
  }

  // Terms page - show without app chrome
  if (currentView === AppView.TERMS) {
    return <TermsPage onNavigate={setCurrentView} />;
  }

  // Loading screen
  if (isLoading) {
    return (
      <div className="flex h-screen bg-slate-50 items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600 font-medium">Loading your SOPs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar
        currentView={currentView}
        onViewChange={setCurrentView}
        isOpen={isSidebarOpen}
        onToggle={() => setSidebarOpen(!isSidebarOpen)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header onToggleSidebar={() => setSidebarOpen(!isSidebarOpen)} onNavigate={setCurrentView} />

        {/* Sync status indicator */}
        {syncStatus !== 'idle' && (
          <div className={`px-4 py-2 text-center text-sm font-medium ${
            syncStatus === 'saving' ? 'bg-amber-100 text-amber-800' :
            syncStatus === 'saved' ? 'bg-emerald-100 text-emerald-800' :
            'bg-red-100 text-red-800'
          }`}>
            {syncStatus === 'saving' && (
              <><i className="fas fa-cloud-arrow-up mr-2 animate-pulse"></i>Syncing to cloud...</>
            )}
            {syncStatus === 'saved' && (
              <><i className="fas fa-cloud-check mr-2"></i>Saved to cloud</>
            )}
            {syncStatus === 'error' && (
              <><i className="fas fa-exclamation-triangle mr-2"></i>Failed to sync - data saved locally</>
            )}
          </div>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto h-full">
            {renderView()}
          </div>
        </main>
      </div>

      {/* Login prompt modal */}
      {showLoginPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-user-lock text-2xl text-indigo-600"></i>
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">Sign in to Save</h3>
              <p className="text-slate-600">
                Your SOP was created! Sign in with Google to save it to your account.
              </p>
            </div>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  await signIn();
                  setShowLoginPrompt(false);
                }}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white border-2 border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors font-medium"
              >
                <i className="fab fa-google text-red-500 text-lg"></i>
                Sign in with Google
              </button>
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="w-full px-4 py-3 text-slate-500 hover:text-slate-700 transition-colors font-medium"
              >
                Continue without saving
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
