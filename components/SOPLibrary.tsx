
import React, { useState } from 'react';
import { SOP } from '../types';
import { deleteSOP, isSupabaseConfigured } from '../services/supabaseService';

interface SOPLibraryProps {
  sops: SOP[];
  onDelete?: (sopId: string) => void;
}

const SOPLibrary: React.FC<SOPLibraryProps> = ({ sops, onDelete }) => {
  const [selectedSop, setSelectedSop] = useState<SOP | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Handle delete SOP
  const handleDelete = async (sop: SOP) => {
    if (!confirm(`Delete "${sop.title}"? This cannot be undone.`)) return;

    setIsDeleting(true);
    try {
      if (isSupabaseConfigured()) {
        const success = await deleteSOP(sop.id);
        if (!success) {
          alert('Failed to delete SOP from cloud. Please try again.');
          setIsDeleting(false);
          return;
        }
      }
      // Update local state
      if (onDelete) {
        onDelete(sop.id);
      }
      setSelectedSop(null);
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete SOP. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filter SOPs based on search and type
  const filteredSops = sops.filter(sop => {
    const matchesSearch = searchQuery === '' ||
      sop.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      sop.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === 'all' || sop.sourceType === filterType;
    return matchesSearch && matchesType;
  });

  // Generate PDF by opening print-friendly view
  const exportToPDF = (sop: SOP) => {
    setIsExporting(true);

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export PDF');
      setIsExporting(false);
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${sop.title} - SOP</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1e293b; }
          h1 { font-size: 28px; margin-bottom: 8px; color: #0f172a; }
          .meta { color: #64748b; font-size: 12px; margin-bottom: 24px; }
          .description { font-size: 16px; color: #475569; margin-bottom: 32px; line-height: 1.6; padding: 16px; background: #f8fafc; border-radius: 8px; }
          .section-title { font-size: 14px; font-weight: 700; color: #4f46e5; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 12px; }
          .ppe-list, .materials-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px; }
          .ppe-item, .material-item { background: #e0e7ff; color: #3730a3; padding: 6px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
          .steps { margin-top: 32px; }
          .step { display: flex; gap: 20px; margin-bottom: 32px; page-break-inside: avoid; }
          .step-number { width: 40px; height: 40px; background: #4f46e5; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
          .step-content { flex: 1; }
          .step-title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
          .step-desc { color: #475569; line-height: 1.6; margin-bottom: 12px; }
          .step-image { width: 100%; max-height: 300px; object-fit: contain; border-radius: 8px; margin-top: 12px; border: 1px solid #e2e8f0; }
          .safety-warning { background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px; margin: 12px 0; border-radius: 0 8px 8px 0; }
          .safety-warning-title { color: #dc2626; font-weight: 700; font-size: 12px; text-transform: uppercase; margin-bottom: 4px; }
          .safety-warning-text { color: #7f1d1d; font-size: 13px; }
          .tools { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
          .tool { background: #f1f5f9; padding: 4px 10px; border-radius: 4px; font-size: 11px; color: #475569; }
          .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e2e8f0; text-align: center; color: #94a3b8; font-size: 11px; }
          @media print {
            body { padding: 20px; }
            .step { page-break-inside: avoid; }
            .step-image { max-height: 200px; }
          }
        </style>
      </head>
      <body>
        <h1>${sop.title}</h1>
        <div class="meta">Created: ${new Date(sop.createdAt).toLocaleDateString()} | ${sop.steps.length} Steps | Source: ${sop.sourceType}</div>

        ${sop.description ? `<div class="description">${sop.description}</div>` : ''}

        ${sop.ppeRequirements && sop.ppeRequirements.length > 0 ? `
          <div class="section-title">Required PPE</div>
          <div class="ppe-list">
            ${sop.ppeRequirements.map(ppe => `<span class="ppe-item">${ppe}</span>`).join('')}
          </div>
        ` : ''}

        ${sop.materialsRequired && sop.materialsRequired.length > 0 ? `
          <div class="section-title">Materials Required</div>
          <div class="materials-list">
            ${sop.materialsRequired.map(mat => `<span class="material-item">${mat}</span>`).join('')}
          </div>
        ` : ''}

        <div class="steps">
          <div class="section-title">Procedure Steps</div>
          ${sop.steps.map((step, idx) => `
            <div class="step">
              <div class="step-number">${idx + 1}</div>
              <div class="step-content">
                <div class="step-title">${step.title}</div>
                <div class="step-desc">${step.description}</div>
                ${step.safetyWarnings && step.safetyWarnings.length > 0 ? `
                  <div class="safety-warning">
                    <div class="safety-warning-title">⚠️ Safety Warning</div>
                    ${step.safetyWarnings.map(w => `<div class="safety-warning-text">${w}</div>`).join('')}
                  </div>
                ` : ''}
                ${step.toolsRequired && step.toolsRequired.length > 0 ? `
                  <div class="tools">
                    ${step.toolsRequired.map(t => `<span class="tool">${t}</span>`).join('')}
                  </div>
                ` : ''}
                ${step.image_url || step.thumbnail ? `<img class="step-image" src="${step.image_url || step.thumbnail}" alt="Step ${idx + 1}" crossorigin="anonymous" />` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="footer">
          Generated by FrameOps | ${new Date().toLocaleString()}
        </div>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    setIsExporting(false);
  };

  // Copy shareable link
  const copyShareLink = (sop: SOP) => {
    const shareUrl = `${window.location.origin}/sop/${sop.id}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert('Link copied to clipboard!');
    }).catch(() => {
      prompt('Copy this link:', shareUrl);
    });
  };

  const getPPEIcon = (ppe: string) => {
    const p = ppe.toLowerCase();
    if (p.includes('glass') || p.includes('eye')) return 'fa-glasses';
    if (p.includes('glove')) return 'fa-hand';
    if (p.includes('boot') || p.includes('shoe')) return 'fa-shoe-prints';
    if (p.includes('helmet') || p.includes('head')) return 'fa-hard-hat';
    if (p.includes('ear') || p.includes('noise')) return 'fa-ear-listen';
    if (p.includes('mask') || p.includes('resp')) return 'fa-head-side-mask';
    return 'fa-shield-halved';
  };

  if (selectedSop) {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6 pb-20">
        <button 
          onClick={() => setSelectedSop(null)}
          className="flex items-center gap-2 text-indigo-600 font-semibold hover:gap-3 transition-all"
        >
          <i className="fas fa-arrow-left"></i>
          Back to Library
        </button>

        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 overflow-hidden">
          {/* Header Banner */}
          <div className="relative h-80 bg-slate-900">
            <img 
              src={selectedSop.thumbnail_url || selectedSop.steps[0]?.image_url || selectedSop.steps[0]?.thumbnail || `https://picsum.photos/seed/${selectedSop.id}/1200/400`} 
              className="w-full h-full object-cover opacity-60"
              alt=""
              crossOrigin="anonymous"
            />
            <div className="absolute inset-0 flex flex-col justify-end p-10 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-4 py-1.5 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full">
                  Verified Procedure
                </span>
                <span className="px-4 py-1.5 bg-white/10 text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-full backdrop-blur-md">
                  {selectedSop.sourceType}
                </span>
              </div>
              <h1 className="text-5xl font-black text-white mb-4 tracking-tight leading-none">{selectedSop.title}</h1>
              <div className="flex items-center gap-6 text-slate-300 text-xs font-bold uppercase tracking-wider">
                <span className="flex items-center gap-2">
                  <i className="fas fa-calendar-day text-indigo-400"></i>
                  {new Date(selectedSop.createdAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-2">
                  <i className="fas fa-layer-group text-indigo-400"></i>
                  {selectedSop.steps.length} Phases
                </span>
              </div>
            </div>
          </div>

          <div className="p-10 grid grid-cols-1 lg:grid-cols-4 gap-12">
            {/* Left Content Area */}
            <div className="lg:col-span-3 space-y-16">
              {/* Executive Summary */}
              <section>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-lg">
                    <i className="fas fa-align-left"></i>
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Executive Summary</h2>
                </div>
                <p className="text-xl text-slate-600 leading-relaxed font-medium">
                  {selectedSop.description}
                </p>
              </section>

              {/* Pre-requisites Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* PPE Section */}
                <section className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-6">
                    <i className="fas fa-user-shield text-indigo-600 text-xl"></i>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Required PPE</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedSop.ppeRequirements?.map((ppe, i) => (
                      <div key={i} className="flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="w-8 h-8 bg-indigo-50 text-indigo-500 rounded-lg flex items-center justify-center text-xs">
                          <i className={`fas ${getPPEIcon(ppe)}`}></i>
                        </div>
                        <span className="text-xs font-bold text-slate-700">{ppe}</span>
                      </div>
                    )) || <p className="text-xs text-slate-400 italic">No specific PPE identified.</p>}
                  </div>
                </section>

                {/* Materials Section */}
                <section className="bg-slate-50 p-8 rounded-3xl border border-slate-100">
                  <div className="flex items-center gap-3 mb-6">
                    <i className="fas fa-box-open text-indigo-600 text-xl"></i>
                    <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Materials Required</h3>
                  </div>
                  <ul className="space-y-3">
                    {selectedSop.materialsRequired?.map((mat, i) => (
                      <li key={i} className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                        {mat}
                      </li>
                    )) || <p className="text-xs text-slate-400 italic">No materials listed.</p>}
                  </ul>
                </section>
              </div>

              {/* Execution Steps */}
              <section>
                <div className="flex items-center gap-3 mb-10">
                  <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center text-lg">
                    <i className="fas fa-shoe-prints"></i>
                  </div>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Execution Steps</h2>
                </div>
                
                <div className="space-y-24 relative">
                  <div className="absolute left-[20px] top-4 bottom-4 w-px bg-slate-100"></div>
                  
                  {selectedSop.steps.map((step, idx) => (
                    <div key={step.id} className="relative pl-16">
                      <div className="absolute left-0 top-0 w-10 h-10 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center text-xs font-black text-slate-400 z-10">
                        {idx + 1}
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                        <div className="space-y-6">
                          <div className="space-y-2">
                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Phase {idx + 1} • {step.timestamp}</span>
                            <h3 className="text-3xl font-black text-slate-900 leading-tight">{step.title}</h3>
                          </div>
                          <p className="text-lg text-slate-600 leading-relaxed">
                            {step.description}
                          </p>
                          
                          {/* Step Safety */}
                          {step.safetyWarnings && step.safetyWarnings.length > 0 && (
                            <div className="p-6 bg-rose-50 border-l-4 border-rose-500 rounded-r-2xl">
                              <div className="flex items-center gap-2 mb-3 text-rose-700">
                                <i className="fas fa-triangle-exclamation"></i>
                                <span className="text-xs font-black uppercase tracking-widest">Safety Critical</span>
                              </div>
                              <ul className="space-y-2">
                                {step.safetyWarnings.map((w, i) => (
                                  <li key={i} className="text-sm font-bold text-rose-900">{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Step Tools */}
                          {step.toolsRequired && step.toolsRequired.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {step.toolsRequired.map((t, i) => (
                                <span key={i} className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-xs font-black uppercase tracking-tighter border border-indigo-100">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        
                        {/* Visual Asset */}
                        <div className="group relative aspect-video bg-slate-100 rounded-[2rem] overflow-hidden border border-slate-200 shadow-inner">
                          <img 
                            src={step.image_url || step.thumbnail || `https://picsum.photos/seed/${step.id}/600/350`} 
                            className="w-full h-auto rounded-lg shadow-md mb-4 object-cover group-hover:scale-105 transition-transform duration-700" 
                            alt={step.title} 
                            crossOrigin="anonymous"
                          />
                          <div className="absolute top-4 right-4 p-3 bg-white/80 backdrop-blur rounded-full text-slate-900 text-xs shadow-lg">
                            <i className="fas fa-expand"></i>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Sticky Sidebar Actions */}
            <div className="lg:col-span-1">
              <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white space-y-8 sticky top-24 shadow-2xl shadow-slate-900/40">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mb-2">Actions</h4>
                  <p className="text-xs text-slate-400">Export and distribute this technical procedure.</p>
                </div>
                
                <div className="space-y-3">
                  <button
                    onClick={() => exportToPDF(selectedSop)}
                    disabled={isExporting}
                    className="w-full py-4 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-600/30 disabled:opacity-50"
                  >
                    <i className={`fas ${isExporting ? 'fa-spinner fa-spin' : 'fa-file-pdf'} text-base`}></i>
                    {isExporting ? 'Generating...' : 'Export PDF'}
                  </button>
                  <button
                    onClick={() => exportToPDF(selectedSop)}
                    className="w-full py-4 bg-white/10 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white/20 transition-all flex items-center justify-center gap-3 backdrop-blur-md"
                  >
                    <i className="fas fa-file-word text-blue-400 text-base"></i>
                    Export Word
                  </button>
                  <button
                    onClick={() => copyShareLink(selectedSop)}
                    className="w-full py-4 bg-white/10 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-white/20 transition-all flex items-center justify-center gap-3 backdrop-blur-md"
                  >
                    <i className="fas fa-share-nodes text-emerald-400 text-base"></i>
                    Share URL
                  </button>
                </div>

                <div className="pt-8 mt-8 border-t border-white/5 space-y-4">
                  <div className="p-4 bg-white/5 rounded-2xl">
                    <p className="text-[10px] text-slate-500 font-bold mb-1">Status</p>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-sm font-black uppercase tracking-widest">Active SOP</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(selectedSop)}
                    disabled={isDeleting}
                    className="w-full py-4 text-rose-400 font-black uppercase tracking-widest text-[10px] hover:text-rose-300 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <i className={`fas ${isDeleting ? 'fa-spinner fa-spin' : 'fa-trash'}`}></i>
                    {isDeleting ? 'Deleting...' : 'Delete SOP'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Procedure Library</h1>
          <p className="text-slate-500 mt-1 font-medium">
            {searchQuery || filterType !== 'all'
              ? `${filteredSops.length} of ${sops.length} procedures`
              : `${sops.length} procedures in your library`}
          </p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-4 flex items-center text-slate-400">
              <i className="fas fa-search text-xs"></i>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search SOPs..."
              className="pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-48 transition-all"
            />
          </div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer"
          >
            <option value="all">All Types</option>
            <option value="upload">Uploads</option>
            <option value="youtube">YouTube</option>
            <option value="live">Live</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {filteredSops.length === 0 ? (
          <div className="col-span-full py-32 text-center">
            <div className="w-24 h-24 bg-slate-100 rounded-[2rem] flex items-center justify-center mx-auto mb-6">
              <i className={`fas ${sops.length === 0 ? 'fa-folder-plus' : 'fa-search'} text-slate-300 text-4xl`}></i>
            </div>
            <h3 className="text-2xl font-black text-slate-900 tracking-tight uppercase">
              {sops.length === 0 ? 'Repository Empty' : 'No Results Found'}
            </h3>
            <p className="text-slate-500 mt-2 font-medium">
              {sops.length === 0
                ? 'Capture or import content to build your knowledge base.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
          </div>
        ) : (
          filteredSops.map((sop) => (
            <div 
              key={sop.id} 
              onClick={() => setSelectedSop(sop)}
              className="group bg-white rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 cursor-pointer flex flex-col h-full"
            >
              <div className="relative h-56 overflow-hidden shrink-0">
                <img 
                  src={sop.thumbnail_url || `https://picsum.photos/seed/${sop.id}/400/225`} 
                  alt={sop.title}
                  className="w-full h-48 object-cover group-hover:scale-110 transition-transform duration-1000"
                  crossOrigin="anonymous"
                />
                <div className="absolute top-6 left-6">
                  <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest backdrop-blur-xl border border-white/20 shadow-xl ${
                    sop.sourceType === 'youtube' ? 'bg-rose-500/80 text-white' : 'bg-slate-900/80 text-white'
                  }`}>
                    {sop.sourceType}
                  </span>
                </div>
                <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-4 group-hover:translate-y-0">
                  <div className="p-3 bg-white rounded-2xl text-slate-900 font-black text-[10px] shadow-2xl">
                    {sop.steps.length} STEPS
                  </div>
                </div>
              </div>
              <div className="p-8 flex-1 flex flex-col">
                <h3 className="text-2xl font-black text-slate-900 mb-3 line-clamp-2 leading-tight group-hover:text-indigo-600 transition-colors tracking-tight">
                  {sop.title}
                </h3>
                <p className="text-sm text-slate-500 font-medium line-clamp-3 flex-1 mb-6 leading-relaxed">
                  {sop.description}
                </p>
                <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <i className="fas fa-calendar-alt text-indigo-400"></i>
                    {new Date(sop.createdAt).toLocaleDateString()}
                  </div>
                  <div className="w-8 h-8 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300">
                    <i className="fas fa-chevron-right text-[10px]"></i>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default SOPLibrary;
