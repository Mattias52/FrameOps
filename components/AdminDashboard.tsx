
import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { fetchAdminSOPsList, fetchSOPSteps, AdminSOP } from '../services/supabaseService';
import { SOPStep } from '../types';

const PAGE_SIZE = 50;

const AdminDashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [sops, setSops] = useState<AdminSOP[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expandedSopId, setExpandedSopId] = useState<string | null>(null);
  const [loadingSteps, setLoadingSteps] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, SOPStep[]>>({});
  const [hasMore, setHasMore] = useState(false);

  const loadSOPs = useCallback(async (offset: number = 0) => {
    if (!user?.id) return;
    setLoading(true);
    const result = await fetchAdminSOPsList(user.id, PAGE_SIZE, offset);
    if (offset === 0) {
      setSops(result.sops);
    } else {
      setSops(prev => [...prev, ...result.sops]);
    }
    setTotal(result.total);
    setHasMore(offset + PAGE_SIZE < result.total);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadSOPs();
  }, [loadSOPs]);

  const handleToggleSteps = async (sopId: string) => {
    if (expandedSopId === sopId) {
      setExpandedSopId(null);
      return;
    }
    setExpandedSopId(sopId);
    if (!steps[sopId]) {
      setLoadingSteps(sopId);
      const sopSteps = await fetchSOPSteps(sopId);
      setSteps(prev => ({ ...prev, [sopId]: sopSteps }));
      setLoadingSteps(null);
    }
  };

  const uniqueOwners = new Set(sops.map(s => s.ownerEmail)).size;
  const latestDate = sops.length > 0
    ? new Date(sops[0].createdAt).toLocaleDateString()
    : '-';

  const sourceIcon = (type: string) => {
    switch (type) {
      case 'youtube': return 'fa-brands fa-youtube text-red-500';
      case 'live': return 'fas fa-video text-emerald-500';
      default: return 'fas fa-upload text-blue-500';
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.title')}</h1>
        <p className="text-sm text-slate-500 mt-1">{t('admin.sopsByCustomers')}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <i className="fas fa-users text-indigo-600"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{uniqueOwners}</p>
              <p className="text-xs text-slate-500">{t('admin.customers')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
              <i className="fas fa-file-lines text-emerald-600"></i>
            </div>
            <div>
              <p className="text-2xl font-bold text-slate-900">{total}</p>
              <p className="text-xs text-slate-500">{t('admin.totalCustomerSops')}</p>
            </div>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <i className="fas fa-clock text-amber-600"></i>
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900">{latestDate}</p>
              <p className="text-xs text-slate-500">{t('admin.latestSop')}</p>
            </div>
          </div>
        </div>
      </div>

      {/* SOP List */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        {loading && sops.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <i className="fas fa-spinner fa-spin text-2xl mb-3"></i>
            <p>{t('admin.loading')}</p>
          </div>
        ) : sops.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <i className="fas fa-inbox text-3xl mb-3"></i>
            <p>{t('admin.noSops')}</p>
          </div>
        ) : (
          <>
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px_120px_180px] gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <span>Title</span>
              <span className="text-center">{t('admin.steps')}</span>
              <span className="text-center">{t('admin.source')}</span>
              <span>{t('admin.created')}</span>
              <span>{t('admin.owner')}</span>
            </div>

            {/* Rows */}
            {sops.map(sop => (
              <div key={sop.id} className="border-b border-slate-50 last:border-0">
                <div
                  className="grid grid-cols-[1fr_80px_80px_120px_180px] gap-2 px-5 py-3 hover:bg-slate-50 cursor-pointer transition-colors items-center"
                  onClick={() => handleToggleSteps(sop.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <i className={`fas fa-chevron-right text-xs text-slate-400 transition-transform ${expandedSopId === sop.id ? 'rotate-90' : ''}`}></i>
                    <span className="truncate text-sm font-medium text-slate-800">{sop.title}</span>
                  </div>
                  <span className="text-center text-sm text-slate-600">{sop.numSteps || '-'}</span>
                  <span className="text-center"><i className={sourceIcon(sop.sourceType)}></i></span>
                  <span className="text-sm text-slate-500">{new Date(sop.createdAt).toLocaleDateString()}</span>
                  <span className="text-sm text-slate-500 truncate">{sop.ownerEmail}</span>
                </div>

                {/* Expanded steps */}
                {expandedSopId === sop.id && (
                  <div className="px-5 pb-4 bg-slate-50/50">
                    {loadingSteps === sop.id ? (
                      <div className="py-4 text-center text-slate-400 text-sm">
                        <i className="fas fa-spinner fa-spin mr-2"></i>
                        {t('library.loadingSopDetails')}
                      </div>
                    ) : steps[sop.id]?.length ? (
                      <div className="space-y-2 ml-5">
                        {steps[sop.id].map((step, idx) => (
                          <div key={step.id} className="flex gap-3 items-start bg-white rounded-xl p-3 border border-slate-100">
                            {step.thumbnail ? (
                              <img
                                src={step.thumbnail}
                                alt={step.title}
                                className="w-20 h-14 object-cover rounded-lg flex-shrink-0 bg-slate-100"
                              />
                            ) : (
                              <div className="w-20 h-14 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <i className="fas fa-image text-slate-300"></i>
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800">
                                <span className="text-indigo-500 font-semibold mr-1">{idx + 1}.</span>
                                {step.title || 'Untitled'}
                              </p>
                              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{step.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="py-3 text-sm text-slate-400 text-center">No steps found</p>
                    )}
                  </div>
                )}
              </div>
            ))}

            {/* Load more */}
            {hasMore && (
              <div className="p-4 text-center border-t border-slate-100">
                <button
                  onClick={() => loadSOPs(sops.length)}
                  disabled={loading}
                  className="px-6 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors disabled:opacity-50"
                >
                  {loading ? <i className="fas fa-spinner fa-spin mr-2"></i> : null}
                  {t('admin.loadMore')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
