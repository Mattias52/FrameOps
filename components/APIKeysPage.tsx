import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseService';

interface APIKey {
  id: string;
  key: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

interface APIKeysPageProps {
  onBack?: () => void;
}

const APIKeysPage: React.FC<APIKeysPageProps> = ({ onBack }) => {
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load API keys
  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    setIsLoading(true);
    setError(null);

    if (!isSupabaseConfigured() || !supabase) {
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, key, name, created_at, last_used_at, is_active')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error loading API keys:', error);
        setError('Failed to load API keys');
      } else {
        setApiKeys(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to load API keys');
    }

    setIsLoading(false);
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      setError('Please enter a name for your API key');
      return;
    }

    if (!isSupabaseConfigured() || !supabase) {
      setError('Database not configured');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('api_keys')
        .insert({ name: newKeyName.trim() })
        .select('key')
        .single();

      if (error) {
        console.error('Error creating API key:', error);
        setError('Failed to create API key');
        return;
      }

      setCreatedKey(data.key);
      setNewKeyName('');
      loadApiKeys();
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to create API key');
    }
  };

  const deleteApiKey = async (keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key? This cannot be undone.')) {
      return;
    }

    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) {
        console.error('Error deleting API key:', error);
        setError('Failed to delete API key');
      } else {
        loadApiKeys();
      }
    } catch (err) {
      console.error('Error:', err);
      setError('Failed to delete API key');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const maskKey = (key: string) => {
    if (key.length <= 12) return key;
    return key.substring(0, 8) + '...' + key.substring(key.length - 4);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">API Access</h1>
        <p className="text-slate-600">
          Integrate FrameOps into your workflows with our REST API.
        </p>
      </div>

      {/* Quick Start */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 mb-8 text-white">
        <h2 className="text-lg font-semibold mb-3">Quick Start</h2>
        <div className="bg-black/20 rounded-lg p-4 font-mono text-sm overflow-x-auto">
          <pre>{`curl -X POST https://frameops-production.up.railway.app/api/v1/generate-sop \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"youtube_url": "https://youtube.com/watch?v=..."}'`}</pre>
        </div>
        <div className="mt-4 flex gap-3">
          <a
            href="https://frameops-production.up.railway.app/api/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <i className="fas fa-book"></i>
            API Documentation
          </a>
        </div>
      </div>

      {/* API Keys Section */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-8">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Your API Keys</h2>
            <p className="text-sm text-slate-500">Manage your API keys for authentication</p>
          </div>
          <button
            onClick={() => setShowNewKeyModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            Create Key
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-b border-red-100 text-red-700 text-sm">
            <i className="fas fa-exclamation-circle mr-2"></i>
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="p-12 text-center text-slate-400">
            <i className="fas fa-spinner fa-spin text-2xl mb-2"></i>
            <p>Loading API keys...</p>
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-key text-2xl text-slate-400"></i>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No API keys yet</h3>
            <p className="text-slate-500 mb-4">Create your first API key to start using the API</p>
            <button
              onClick={() => setShowNewKeyModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              Create Your First Key
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {apiKeys.map((key) => (
              <div key={key.id} className="p-4 flex items-center justify-between hover:bg-slate-50">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${key.is_active ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                    <i className={`fas fa-key ${key.is_active ? 'text-emerald-600' : 'text-slate-400'}`}></i>
                  </div>
                  <div>
                    <div className="font-medium text-slate-900">{key.name}</div>
                    <div className="text-sm text-slate-500 font-mono">{maskKey(key.key)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right text-sm text-slate-500 hidden sm:block">
                    <div>Created {new Date(key.created_at).toLocaleDateString()}</div>
                    {key.last_used_at && (
                      <div>Last used {new Date(key.last_used_at).toLocaleDateString()}</div>
                    )}
                  </div>
                  <button
                    onClick={() => copyToClipboard(key.key)}
                    className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                    title="Copy key"
                  >
                    <i className={`fas ${copiedKey === key.key ? 'fa-check text-emerald-500' : 'fa-copy'}`}></i>
                  </button>
                  <button
                    onClick={() => deleteApiKey(key.id)}
                    className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                    title="Delete key"
                  >
                    <i className="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rate Limits Info */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Rate Limits</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="text-2xl font-bold text-slate-900">100</div>
            <div className="text-sm text-slate-500">Requests/month (Free)</div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <div className="text-2xl font-bold text-indigo-600">10,000</div>
            <div className="text-sm text-slate-500">Requests/month (Pro)</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
            <div className="text-2xl font-bold text-purple-600">Unlimited</div>
            <div className="text-sm text-slate-500">Enterprise</div>
          </div>
        </div>
      </div>

      {/* Create Key Modal */}
      {showNewKeyModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            {createdKey ? (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-check text-2xl text-emerald-600"></i>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">API Key Created!</h3>
                  <p className="text-slate-500 text-sm">
                    Copy your key now. You won't be able to see it again.
                  </p>
                </div>
                <div className="bg-slate-100 rounded-lg p-4 font-mono text-sm break-all mb-6">
                  {createdKey}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => copyToClipboard(createdKey)}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    <i className={`fas ${copiedKey === createdKey ? 'fa-check' : 'fa-copy'}`}></i>
                    {copiedKey === createdKey ? 'Copied!' : 'Copy Key'}
                  </button>
                  <button
                    onClick={() => {
                      setShowNewKeyModal(false);
                      setCreatedKey(null);
                    }}
                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Create API Key</h3>
                <p className="text-slate-500 text-sm mb-6">
                  Give your key a name to help you remember what it's used for.
                </p>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production Server, Zapier Integration"
                  className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 mb-6"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && createApiKey()}
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowNewKeyModal(false);
                      setNewKeyName('');
                      setError(null);
                    }}
                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={createApiKey}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                  >
                    Create Key
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default APIKeysPage;
