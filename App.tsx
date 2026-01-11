
import React, { useState, useEffect } from 'react';
import { AppView, SOP } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import SOPGenerator from './components/SOPGenerator';
import LiveSOPGenerator from './components/LiveSOPGenerator';
import SOPLibrary from './components/SOPLibrary';
import SubscriptionPlans from './components/SubscriptionPlans';
import Transcripts from './components/Transcripts';
import ErrorBoundary from './components/ErrorBoundary';
import LandingPage from './components/LandingPage';
import CreatorLandingPage from './components/CreatorLandingPage';
import APIKeysPage from './components/APIKeysPage';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import { fetchSOPs, saveSOP, isSupabaseConfigured } from './services/supabaseService';

const App: React.FC = () => {
  // Check if user has entered the app before
  const hasVisited = typeof window !== 'undefined' && window.localStorage.getItem('frameops_visited');
  const [currentView, setCurrentView] = useState<AppView>(hasVisited ? AppView.DASHBOARD : AppView.LANDING);
  const [sops, setSops] = useState<SOP[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Start with sidebar closed on mobile
  const [isSidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  // Load SOPs from Supabase (or localStorage fallback)
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);

      if (isSupabaseConfigured()) {
        // Load from Supabase
        console.log('Loading from Supabase...');
        const cloudSops = await fetchSOPs();
        if (cloudSops.length > 0) {
          setSops(cloudSops);
        }
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
  }, []);

  const handleAddSOP = async (newSop: SOP) => {
    // Optimistically update UI
    const updated = [newSop, ...sops];
    setSops(updated);

    if (isSupabaseConfigured()) {
      // Save to Supabase
      setSyncStatus('saving');
      const result = await saveSOP(newSop);
      if (result.success) {
        // Update the SOP with the database-generated ID
        if (result.id) {
          setSops(prev => prev.map(s =>
            s.id === newSop.id ? { ...s, id: result.id! } : s
          ));
        }
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
      } else {
        setSyncStatus('error');
        console.error('Failed to save to Supabase');
      }
    } else {
      // Fallback: Save to localStorage without thumbnails
      try {
        const toSave = updated.map(sop => ({
          ...sop,
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
            />
          </ErrorBoundary>
        );
      case AppView.LIBRARY:
        return (
          <SOPLibrary
            sops={sops}
            onDelete={(sopId) => setSops(prev => prev.filter(s => s.id !== sopId))}
            onUpdate={(updatedSop) => setSops(prev => prev.map(s => s.id === updatedSop.id ? updatedSop : s))}
            isPro={true} // Beta: full access for everyone
          />
        );
      case AppView.SUBSCRIPTION:
        return <SubscriptionPlans />;
      case AppView.TRANSCRIPTS:
        return <Transcripts />;
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
    </div>
  );
};

export default App;
