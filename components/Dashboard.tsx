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
    { label: 'Total SOPs', value: sops.length, icon: 'fa-file-lines', color: 'bg-indigo-500', trend: null },
    { label: 'Total Steps', value: totalSteps, icon: 'fa-list-check', color: 'bg-emerald-500', trend: null },
    { label: 'Completed', value: completedSOPs, icon: 'fa-circle-check', color: 'bg-blue-500', trend: null },
    { label: 'Processing', value: processingSOPs, icon: 'fa-spinner', color: 'bg-amber-500', trend: null },
  ];

  const quickActions = [
    {
      title: 'Upload Video',
      description: 'Upload an MP4, MOV, or WebM file',
      icon: 'fa-upload',
      color: 'bg-indigo-500',
      action: () => onNavigate(AppView.GENERATOR)
    },
    {
      title: 'YouTube Import',
      description: 'Paste a YouTube URL to extract SOP',
      icon: 'fa-youtube',
      color: 'bg-red-500',
      action: () => onNavigate(AppView.GENERATOR)
    },
    {
      title: 'Live Recording',
      description: 'Record a procedure in real-time',
      icon: 'fa-video',
      color: 'bg-emerald-500',
      action: () => onNavigate(AppView.LIVE_GENERATOR)
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 mt-1">Create and manage your standard operating procedures</p>
        </div>
        <button
          onClick={() => onNavigate(AppView.GENERATOR)}
          className="inline-flex items-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
        >
          <i className="fas fa-plus"></i>
          Create New SOP
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 ${stat.color} rounded-xl flex items-center justify-center text-white text-lg shadow-lg`}>
                <i className={`fas ${stat.icon}`}></i>
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-sm text-slate-500">{stat.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action, i) => (
            <button
              key={i}
              onClick={action.action}
              className="p-5 bg-white rounded-2xl border border-slate-100 hover:border-slate-200 hover:shadow-lg transition-all text-left group"
            >
              <div className={`w-12 h-12 ${action.color} rounded-xl flex items-center justify-center text-white text-xl mb-4 group-hover:scale-110 transition-transform`}>
                <i className={`fab ${action.icon === 'fa-youtube' ? 'fa-youtube' : ''} fas ${action.icon !== 'fa-youtube' ? action.icon : ''}`}></i>
              </div>
              <h3 className="font-semibold text-slate-900 mb-1">{action.title}</h3>
              <p className="text-sm text-slate-500">{action.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent SOPs */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">Recent SOPs</h2>
            {sops.length > 0 && (
              <button
                onClick={() => onNavigate(AppView.LIBRARY)}
                className="text-indigo-600 text-sm font-semibold hover:underline"
              >
                View All <i className="fas fa-arrow-right ml-1"></i>
              </button>
            )}
          </div>
          <div className="divide-y divide-slate-100">
            {sops.length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-file-video text-slate-400 text-2xl"></i>
                </div>
                <h3 className="font-semibold text-slate-900 mb-2">No SOPs yet</h3>
                <p className="text-slate-500 text-sm mb-6 max-w-sm mx-auto">
                  Create your first SOP by uploading a video or recording a procedure live.
                </p>
                <button
                  onClick={() => onNavigate(AppView.GENERATOR)}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200"
                >
                  <i className="fas fa-plus mr-2"></i>
                  Create Your First SOP
                </button>
              </div>
            ) : (
              sops.slice(0, 5).map((sop) => (
                <div
                  key={sop.id}
                  onClick={() => onNavigate(AppView.LIBRARY)}
                  className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-4 cursor-pointer group"
                >
                  <div className="w-20 h-14 bg-slate-100 rounded-xl shrink-0 overflow-hidden">
                    <img
                      src={sop.thumbnail_url || sop.steps[Math.floor(sop.steps.length / 3)]?.image_url || sop.steps[0]?.image_url || sop.steps[0]?.thumbnail}
                      alt=""
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      crossOrigin="anonymous"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate group-hover:text-indigo-600 transition-colors">
                      {sop.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-500">
                        <i className="fas fa-calendar mr-1"></i>
                        {new Date(sop.createdAt).toLocaleDateString()}
                      </span>
                      <span className="text-xs text-slate-500">
                        <i className="fas fa-list mr-1"></i>
                        {sop.steps.length} steps
                      </span>
                    </div>
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                    sop.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : sop.status === 'processing'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                  }`}>
                    {sop.status === 'completed' && <i className="fas fa-check mr-1"></i>}
                    {sop.status === 'processing' && <i className="fas fa-spinner fa-spin mr-1"></i>}
                    {sop.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tips & Resources */}
        <div className="space-y-6">
          {/* Pro Tip Card */}
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 rounded-2xl p-6 text-white">
            <div className="flex items-center gap-2 mb-3">
              <i className="fas fa-lightbulb text-amber-300"></i>
              <span className="text-sm font-semibold text-indigo-200">Pro Tip</span>
            </div>
            <h3 className="font-bold text-lg mb-2">Get Better Results</h3>
            <p className="text-indigo-100 text-sm leading-relaxed mb-4">
              For best AI analysis, ensure good lighting and steady camera work. Close-up shots of hands and tools help the AI identify steps more accurately.
            </p>
            <button
              onClick={() => onNavigate(AppView.GENERATOR)}
              className="w-full py-3 bg-white text-indigo-600 font-bold rounded-xl hover:bg-indigo-50 transition-colors"
            >
              Try It Now
            </button>
          </div>

          {/* Features List */}
          <div className="bg-white rounded-2xl p-6 border border-slate-100">
            <h3 className="font-bold text-slate-900 mb-4">What FrameOps Does</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3 text-sm">
                <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
                <span className="text-slate-600">Extracts key frames from video automatically</span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
                <span className="text-slate-600">Identifies safety hazards and PPE requirements</span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
                <span className="text-slate-600">Detects tools and materials in each step</span>
              </li>
              <li className="flex items-start gap-3 text-sm">
                <i className="fas fa-check-circle text-emerald-500 mt-0.5"></i>
                <span className="text-slate-600">Generates professional PDF documentation</span>
              </li>
            </ul>
          </div>

          {/* Keyboard Shortcuts */}
          <div className="bg-slate-50 rounded-2xl p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <i className="fas fa-keyboard text-slate-400"></i>
              Quick Tips
            </h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>Supported: MP4, MOV, WebM, YouTube</li>
              <li>Max video length: 30 minutes</li>
              <li>Edit any step after generation</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
