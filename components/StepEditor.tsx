import React, { useState, useRef } from 'react';
import { SOPStep, FrameOption } from '../types';
import { enhanceStepText } from '../services/youtubeService';

interface StepEditorProps {
  step: SOPStep;
  stepIndex: number;
  totalSteps: number;
  onUpdate: (updatedStep: SOPStep) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onImageReplace: (newImageUrl: string) => void;
  onAddAfter: () => void;
  allFrames?: FrameOption[];
}

const StepEditor: React.FC<StepEditorProps> = ({
  step,
  stepIndex,
  totalSteps,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onImageReplace,
  onAddAfter,
  allFrames = [],
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localStep, setLocalStep] = useState<SOPStep>(step);
  const [newWarning, setNewWarning] = useState('');
  const [newTool, setNewTool] = useState('');
  const [showFramePicker, setShowFramePicker] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Enhancement handler
  const handleEnhance = async () => {
    setIsEnhancing(true);
    try {
      const result = await enhanceStepText(localStep.title, localStep.description);
      if (result) {
        const updated = {
          ...localStep,
          title: result.title,
          description: result.description,
          safetyWarnings: result.safetyWarnings && result.safetyWarnings.length > 0
            ? [...(localStep.safetyWarnings || []), ...result.safetyWarnings]
            : localStep.safetyWarnings
        };
        setLocalStep(updated);
        onUpdate(updated);
      }
    } catch (error) {
      console.error('Enhancement failed:', error);
    }
    setIsEnhancing(false);
  };

  const handleFrameSelect = (frame: FrameOption) => {
    handleChange('thumbnail', frame.imageBase64);
    handleChange('image_url', frame.imageBase64);
    onImageReplace(frame.imageBase64);
    setShowFramePicker(false);
  };

  const handleChange = (field: keyof SOPStep, value: any) => {
    const updated = { ...localStep, [field]: value };
    setLocalStep(updated);
    onUpdate(updated);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      handleChange('thumbnail', base64);
      handleChange('image_url', base64);
      onImageReplace(base64);
    };
    reader.readAsDataURL(file);
  };

  const addSafetyWarning = () => {
    if (!newWarning.trim()) return;
    const warnings = [...(localStep.safetyWarnings || []), newWarning.trim()];
    handleChange('safetyWarnings', warnings);
    setNewWarning('');
  };

  const removeSafetyWarning = (index: number) => {
    const warnings = [...(localStep.safetyWarnings || [])];
    warnings.splice(index, 1);
    handleChange('safetyWarnings', warnings);
  };

  const addTool = () => {
    if (!newTool.trim()) return;
    const tools = [...(localStep.toolsRequired || []), newTool.trim()];
    handleChange('toolsRequired', tools);
    setNewTool('');
  };

  const removeTool = (index: number) => {
    const tools = [...(localStep.toolsRequired || [])];
    tools.splice(index, 1);
    handleChange('toolsRequired', tools);
  };

  return (
    <div className="bg-white border-2 border-indigo-100 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Collapsed Header */}
      <div 
        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Step Number & Reorder */}
        <div className="flex flex-col items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
            disabled={stepIndex === 0}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <i className="fas fa-chevron-up text-xs"></i>
          </button>
          <div className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
            {stepIndex + 1}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
            disabled={stepIndex === totalSteps - 1}
            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <i className="fas fa-chevron-down text-xs"></i>
          </button>
        </div>

        {/* Thumbnail Preview */}
        <div className="w-20 h-14 rounded-lg overflow-hidden bg-slate-100 flex-shrink-0">
          <img 
            src={localStep.image_url || localStep.thumbnail || `https://picsum.photos/seed/${step.id}/80/56`}
            alt=""
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
          />
        </div>

        {/* Title & Description Preview */}
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-slate-900 truncate">{localStep.title || 'Untitled Step'}</h4>
          <p className="text-sm text-slate-500 truncate">{localStep.description || 'No description'}</p>
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-2">
          {localStep.safetyWarnings && localStep.safetyWarnings.length > 0 && (
            <span className="px-2 py-1 bg-rose-100 text-rose-600 text-xs font-bold rounded-full">
              <i className="fas fa-triangle-exclamation mr-1"></i>
              {localStep.safetyWarnings.length}
            </span>
          )}
          {localStep.toolsRequired && localStep.toolsRequired.length > 0 && (
            <span className="px-2 py-1 bg-indigo-100 text-indigo-600 text-xs font-bold rounded-full">
              <i className="fas fa-wrench mr-1"></i>
              {localStep.toolsRequired.length}
            </span>
          )}
        </div>

        {/* Add, Delete & Expand/Collapse */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onAddAfter(); }}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            title="Add step after"
          >
            <i className="fas fa-plus text-sm"></i>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); if (confirm('Delete this step?')) onDelete(); }}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            title="Delete step"
          >
            <i className="fas fa-trash text-sm"></i>
          </button>
          <div className={`w-8 h-8 flex items-center justify-center text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
            <i className="fas fa-chevron-down"></i>
          </div>
        </div>
      </div>

      {/* Expanded Editor */}
      {isExpanded && (
        <div className="border-t border-slate-100 p-6 space-y-6 bg-slate-50/50">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Text Fields */}
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Step Title
                </label>
                <input
                  type="text"
                  value={localStep.title}
                  onChange={(e) => handleChange('title', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="Enter step title..."
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Description
                </label>
                <textarea
                  value={localStep.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                  placeholder="Describe this step in detail..."
                />
                {/* AI Enhance Button */}
                <button
                  onClick={handleEnhance}
                  disabled={isEnhancing}
                  className="mt-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white text-sm font-bold rounded-lg hover:from-purple-600 hover:to-indigo-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-purple-200"
                >
                  {isEnhancing ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Förbättrar...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-wand-magic-sparkles mr-2"></i>
                      ✨ AI Förbättra
                    </>
                  )}
                </button>
              </div>

              {/* Timestamp */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  Timestamp
                </label>
                <input
                  type="text"
                  value={localStep.timestamp}
                  onChange={(e) => handleChange('timestamp', e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="00:00"
                />
              </div>
            </div>

            {/* Right Column - Image */}
            <div className="space-y-4">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                Step Image
              </label>
              <div className="relative aspect-video bg-slate-200 rounded-2xl overflow-hidden group">
                <img
                  src={localStep.image_url || localStep.thumbnail || `https://picsum.photos/seed/${step.id}/400/225`}
                  alt={localStep.title}
                  className="w-full h-full object-cover"
                  crossOrigin="anonymous"
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                  {allFrames.length > 0 && (
                    <button
                      onClick={() => setShowFramePicker(true)}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
                    >
                      <i className="fas fa-images mr-2"></i>
                      Choose Frame
                    </button>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors"
                  >
                    <i className="fas fa-upload mr-2"></i>
                    Upload
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
              <p className="text-xs text-slate-500 text-center">
                {allFrames.length > 0
                  ? `${allFrames.length} frames available • Or upload custom`
                  : 'Click to replace • Max 5MB • JPG, PNG, WebP'}
              </p>
            </div>
          </div>

          {/* Safety Warnings */}
          <div className="pt-4 border-t border-slate-200">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
              <i className="fas fa-triangle-exclamation text-rose-500 mr-2"></i>
              Safety Warnings
            </label>
            <div className="space-y-2 mb-3">
              {(localStep.safetyWarnings || []).map((warning, i) => (
                <div key={i} className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl">
                  <i className="fas fa-exclamation-circle text-rose-500"></i>
                  <span className="flex-1 text-sm text-rose-900">{warning}</span>
                  <button
                    onClick={() => removeSafetyWarning(i)}
                    className="w-6 h-6 flex items-center justify-center text-rose-400 hover:text-rose-600 hover:bg-rose-100 rounded"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newWarning}
                onChange={(e) => setNewWarning(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addSafetyWarning()}
                placeholder="Add safety warning..."
                className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
              <button
                onClick={addSafetyWarning}
                className="px-4 py-2 bg-rose-600 text-white rounded-xl font-bold text-sm hover:bg-rose-700 transition-colors"
              >
                <i className="fas fa-plus"></i>
              </button>
            </div>
          </div>

          {/* Tools Required */}
          <div className="pt-4 border-t border-slate-200">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-3">
              <i className="fas fa-wrench text-indigo-500 mr-2"></i>
              Tools Required
            </label>
            <div className="flex flex-wrap gap-2 mb-3">
              {(localStep.toolsRequired || []).map((tool, i) => (
                <span key={i} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-full text-sm text-indigo-700 font-medium">
                  {tool}
                  <button
                    onClick={() => removeTool(i)}
                    className="w-4 h-4 flex items-center justify-center text-indigo-400 hover:text-indigo-600"
                  >
                    <i className="fas fa-times text-xs"></i>
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTool}
                onChange={(e) => setNewTool(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && addTool()}
                placeholder="Add tool..."
                className="flex-1 px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <button
                onClick={addTool}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors"
              >
                <i className="fas fa-plus"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Frame Picker Modal */}
      {showFramePicker && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900">
                <i className="fas fa-images text-indigo-600 mr-2"></i>
                Choose Frame for Step {stepIndex + 1}
              </h3>
              <button
                onClick={() => setShowFramePicker(false)}
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {allFrames.map((frame, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleFrameSelect(frame)}
                    className="group relative aspect-video bg-slate-100 rounded-lg overflow-hidden hover:ring-2 hover:ring-indigo-500 transition-all"
                  >
                    <img
                      src={frame.imageBase64}
                      alt={`Frame at ${frame.timestamp}`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <span className="text-white text-xs font-mono">{frame.timestamp}</span>
                    </div>
                    <div className="absolute inset-0 bg-indigo-600/0 group-hover:bg-indigo-600/20 transition-colors flex items-center justify-center">
                      <span className="opacity-0 group-hover:opacity-100 bg-white text-indigo-600 px-2 py-1 rounded text-xs font-bold">
                        Select
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
              <p className="text-sm text-slate-500 text-center">
                Click on a frame to use it for this step • {allFrames.length} frames available
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StepEditor;
