import React, { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../services/supabaseService';
import { useTranslation } from 'react-i18next';

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
  // Email signup state
  const [hasAccess, setHasAccess] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupCompany, setSignupCompany] = useState('');
  const [signupUseCase, setSignupUseCase] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [signupError, setSignupError] = useState<string | null>(null);
  const [signupSuccess, setSignupSuccess] = useState(false);

  // API keys state
  const [apiKeys, setApiKeys] = useState<APIKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { t } = useTranslation();

  // Check if user already has API access
  useEffect(() => {
    const savedAccess = localStorage.getItem('frameops_api_access');
    if (savedAccess) {
      setHasAccess(true);
    }
  }, []);

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
        setError(t('apiKeys.failedToLoadKeys'));
      } else {
        setApiKeys(data || []);
      }
    } catch (err) {
      console.error('Error:', err);
      setError(t('apiKeys.failedToLoadKeys'));
    }

    setIsLoading(false);
  };

  const createApiKey = async () => {
    if (!newKeyName.trim()) {
      setError(t('apiKeys.enterKeyName'));
      return;
    }

    if (!isSupabaseConfigured() || !supabase) {
      setError(t('apiKeys.dbNotConfigured'));
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
        setError(t('apiKeys.failedToCreateKey'));
        return;
      }

      setCreatedKey(data.key);
      setNewKeyName('');
      loadApiKeys();
    } catch (err) {
      console.error('Error:', err);
      setError(t('apiKeys.failedToCreateKey'));
    }
  };

  const deleteApiKey = async (keyId: string) => {
    if (!confirm(t('apiKeys.confirmDeleteKey'))) {
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
        setError(t('apiKeys.failedToDeleteKey'));
      } else {
        loadApiKeys();
      }
    } catch (err) {
      console.error('Error:', err);
      setError(t('apiKeys.failedToDeleteKey'));
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

  // Handle email signup
  const handleSignup = async () => {
    if (!signupEmail.trim()) {
      setSignupError(t('apiKeys.emailRequired'));
      return;
    }

    // Simple email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(signupEmail)) {
      setSignupError(t('apiKeys.invalidEmail'));
      return;
    }

    setIsSigningUp(true);
    setSignupError(null);

    try {
      // Save to Supabase if configured
      if (isSupabaseConfigured() && supabase) {
        await supabase.from('api_waitlist').insert({
          email: signupEmail.trim(),
          name: signupName.trim() || null,
          company: signupCompany.trim() || null,
          use_case: signupUseCase.trim() || null,
        });
      }

      // Save access to localStorage
      localStorage.setItem('frameops_api_access', JSON.stringify({
        email: signupEmail.trim(),
        name: signupName.trim(),
        signedUpAt: new Date().toISOString()
      }));

      setSignupSuccess(true);
      setTimeout(() => {
        setHasAccess(true);
      }, 2000);
    } catch (err) {
      console.error('Signup error:', err);
      // Still grant access even if Supabase fails
      localStorage.setItem('frameops_api_access', JSON.stringify({
        email: signupEmail.trim(),
        name: signupName.trim(),
        signedUpAt: new Date().toISOString()
      }));
      setSignupSuccess(true);
      setTimeout(() => {
        setHasAccess(true);
      }, 2000);
    }

    setIsSigningUp(false);
  };

  // Show signup form if no access
  if (!hasAccess) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-200">
            <i className="fas fa-code text-3xl text-white"></i>
          </div>
          <h1 className="text-3xl font-black text-slate-900 mb-3">{t('apiKeys.title')}</h1>
          <p className="text-lg text-slate-600 max-w-md mx-auto">
            {t('apiKeys.subtitle')}
          </p>
        </div>

        {signupSuccess ? (
          <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-8 text-center animate-in zoom-in-95">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-check text-3xl text-emerald-600"></i>
            </div>
            <h2 className="text-2xl font-bold text-emerald-900 mb-2">{t('apiKeys.welcome')}</h2>
            <p className="text-emerald-700">{t('apiKeys.accessGranted')}</p>
            <p className="text-emerald-600 text-sm mt-2">
              <i className="fas fa-spinner fa-spin mr-2"></i>
              {t('apiKeys.loadingApiPage')}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8">
            <h2 className="text-xl font-bold text-slate-900 mb-6 text-center">
              <i className="fas fa-envelope text-indigo-500 mr-2"></i>
              {t('apiKeys.signUpForAccess')}
            </h2>

            {signupError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                <i className="fas fa-exclamation-circle mr-2"></i>
                {signupError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  {t('apiKeys.email')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  placeholder="din@email.com"
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  {t('apiKeys.name')} <span className="text-slate-400 font-normal">({t('apiKeys.optional')})</span>
                </label>
                <input
                  type="text"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  placeholder={t('apiKeys.yourName')}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  {t('apiKeys.company')} <span className="text-slate-400 font-normal">({t('apiKeys.optional')})</span>
                </label>
                <input
                  type="text"
                  value={signupCompany}
                  onChange={(e) => setSignupCompany(e.target.value)}
                  placeholder={t('apiKeys.yourCompany')}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">
                  {t('apiKeys.howWillYouUse')} <span className="text-slate-400 font-normal">({t('apiKeys.optional')})</span>
                </label>
                <textarea
                  value={signupUseCase}
                  onChange={(e) => setSignupUseCase(e.target.value)}
                  placeholder={t('apiKeys.describeUseCase')}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none"
                />
              </div>

              <button
                onClick={handleSignup}
                disabled={isSigningUp}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {isSigningUp ? (
                  <>
                    <i className="fas fa-spinner fa-spin mr-2"></i>
                    {t('apiKeys.signingUp')}
                  </>
                ) : (
                  <>
                    <i className="fas fa-rocket mr-2"></i>
                    {t('apiKeys.getApiAccess')}
                  </>
                )}
              </button>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100">
              <h3 className="text-sm font-bold text-slate-700 mb-4 text-center">{t('apiKeys.whatsIncluded')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-check text-emerald-600 text-sm"></i>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{t('apiKeys.requestsPerMonth')}</p>
                    <p className="text-xs text-slate-500">{t('apiKeys.freeToStart')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-check text-emerald-600 text-sm"></i>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{t('apiKeys.restApi')}</p>
                    <p className="text-xs text-slate-500">{t('apiKeys.simpleIntegration')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-check text-emerald-600 text-sm"></i>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{t('apiKeys.youtubeAndUpload')}</p>
                    <p className="text-xs text-slate-500">{t('apiKeys.bothMethods')}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <i className="fas fa-check text-emerald-600 text-sm"></i>
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">{t('apiKeys.jsonResponse')}</p>
                    <p className="text-xs text-slate-500">{t('apiKeys.structuredData')}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">{t('apiKeys.apiAccess')}</h1>
        <p className="text-slate-600">
          {t('apiKeys.integrateWorkflows')}
        </p>
      </div>

      {/* Quick Start */}
      <div className="bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl p-6 mb-8 text-white">
        <h2 className="text-lg font-semibold mb-3">{t('apiKeys.quickStart')}</h2>
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
            {t('apiKeys.apiDocumentation')}
          </a>
        </div>
      </div>

      {/* API Keys Section */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-8">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t('apiKeys.yourApiKeys')}</h2>
            <p className="text-sm text-slate-500">{t('apiKeys.manageApiKeys')}</p>
          </div>
          <button
            onClick={() => setShowNewKeyModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <i className="fas fa-plus"></i>
            {t('apiKeys.createKey')}
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
            <p>{t('apiKeys.loadingApiKeys')}</p>
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-key text-2xl text-slate-400"></i>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">{t('apiKeys.noApiKeysYet')}</h3>
            <p className="text-slate-500 mb-4">{t('apiKeys.createFirstKeyDesc')}</p>
            <button
              onClick={() => setShowNewKeyModal(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
            >
              {t('apiKeys.createFirstKey')}
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
                    <div>{t('apiKeys.created')} {new Date(key.created_at).toLocaleDateString()}</div>
                    {key.last_used_at && (
                      <div>{t('apiKeys.lastUsed')} {new Date(key.last_used_at).toLocaleDateString()}</div>
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
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('apiKeys.rateLimits')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-slate-50 rounded-xl">
            <div className="text-2xl font-bold text-slate-900">100</div>
            <div className="text-sm text-slate-500">{t('apiKeys.requestsMonthFree')}</div>
          </div>
          <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
            <div className="text-2xl font-bold text-indigo-600">10,000</div>
            <div className="text-sm text-slate-500">{t('apiKeys.requestsMonthPro')}</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-xl border border-purple-100">
            <div className="text-2xl font-bold text-purple-600">Unlimited</div>
            <div className="text-sm text-slate-500">{t('apiKeys.enterprise')}</div>
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
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{t('apiKeys.apiKeyCreated')}</h3>
                  <p className="text-slate-500 text-sm">
                    {t('apiKeys.copyKeyWarning')}
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
                    {copiedKey === createdKey ? t('apiKeys.copied') : t('apiKeys.copyKey')}
                  </button>
                  <button
                    onClick={() => {
                      setShowNewKeyModal(false);
                      setCreatedKey(null);
                    }}
                    className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition-colors"
                  >
                    {t('apiKeys.done')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{t('apiKeys.createApiKey')}</h3>
                <p className="text-slate-500 text-sm mb-6">
                  {t('apiKeys.keyNameHelp')}
                </p>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t('apiKeys.keyNamePlaceholder')}
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
                    {t('apiKeys.cancel')}
                  </button>
                  <button
                    onClick={createApiKey}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
                  >
                    {t('apiKeys.createKey')}
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
