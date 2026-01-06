
import React from 'react';
import { SOP, AppView } from '../types';

interface DashboardProps {
  sops: SOP[];
  onNavigate: (view: AppView) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ sops, onNavigate }) => {
  // Calculate real stats from actual data
  const totalSteps = sops.reduce((sum, sop) => sum + sop.steps.length, 0);
  const completedSOPs = sops.filter(s => s.status === 'completed').length;
  const processingSOPs = sops.filter(s => s.status === 'processing').length;

  const stats = [
    { label: 'SOPs Created', value: sops.length, icon: 'fa-file-lines', color: 'bg-blue-500' },
    { label: 'Total Steps', value: totalSteps, icon: 'fa-list-check', color: 'bg-emerald-500' },
    { label: 'Completed', value: completedSOPs, icon: 'fa-circle-check', color: 'bg-amber-500' },
    { label: 'Processing', value: processingSOPs, icon: 'fa-spinner', color: 'bg-indigo-500' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Welcome to FrameOps</h1>
        <p className="text-slate-500 mt-1">Turn any video into professional SOPs with AI</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center text-white text-xl`}>
              <i className={`fas ${stat.icon}`}></i>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">{stat.label}</p>
              <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">Recent SOPs</h2>
            <button 
              onClick={() => onNavigate(AppView.LIBRARY)}
              className="text-indigo-600 text-sm font-semibold hover:underline"
            >
              View All
            </button>
          </div>
          <div className="divide-y divide-slate-100">
            {sops.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-slate-400">No SOPs generated yet.</p>
                <button 
                  onClick={() => onNavigate(AppView.GENERATOR)}
                  className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                  Create Your First SOP
                </button>
              </div>
            ) : (
              sops.slice(0, 5).map((sop) => (
                <div key={sop.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-4 cursor-pointer">
                  <div className="w-16 h-10 bg-slate-200 rounded shrink-0 overflow-hidden">
                    <img 
                      src={sop.thumbnail_url || sop.steps[0]?.image_url || sop.steps[0]?.thumbnail || `https://picsum.photos/seed/${sop.id}/100/100`} 
                      alt="" 
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{sop.title}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{new Date(sop.createdAt).toLocaleDateString()} • {sop.steps.length} steps</p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    sop.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {sop.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-indigo-600 rounded-2xl p-6 text-white relative overflow-hidden flex flex-col justify-between">
          <div className="relative z-10">
            <h2 className="text-xl font-bold mb-2">Automate with AI</h2>
            <p className="text-indigo-100 text-sm mb-6">
              Upload your technical video or paste a YouTube link, and our Gemini-powered engine will do the heavy lifting.
            </p>
            <ul className="space-y-3 mb-8">
              <li className="flex items-center gap-3 text-sm">
                <i className="fas fa-check-circle text-indigo-300"></i>
                Visual Step Identification
              </li>
              <li className="flex items-center gap-3 text-sm">
                <i className="fas fa-check-circle text-indigo-300"></i>
                Safety Check Recognition
              </li>
              <li className="flex items-center gap-3 text-sm">
                <i className="fas fa-check-circle text-indigo-300"></i>
                Tool Inventory List
              </li>
            </ul>
          </div>
          <button 
            onClick={() => onNavigate(AppView.GENERATOR)}
            className="w-full py-3 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors relative z-10"
          >
            Start Capturing
          </button>
          
          <i className="fas fa-robot absolute -bottom-8 -right-8 text-white opacity-10 text-9xl"></i>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
