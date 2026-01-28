
import React, { useState, useRef, useEffect } from 'react';
import { SOP, SOPStep } from '../types';
import { analyzeSOPFrames } from '../services/geminiService';
import { detectIndustrialObjects } from '../services/visionService';
import { extractYoutubeId, fetchYoutubeMetadata, extractFramesFromUploadedVideo, analyzeVideoNative, analyzeYoutubeNative, ExtractedFrame } from '../services/youtubeService';

interface SOPGeneratorProps {
  onComplete: (sop: SOP) => void;
  onLiveMode?: () => void;
  onNavigateToLibrary?: () => void;
  onOpenSOP?: (sopId: string) => void;
  freeSOPsRemaining?: number;
  isPro?: boolean;
  onUpgrade?: () => void;
}

const SOPGenerator: React.FC<SOPGeneratorProps> = ({
  onComplete,
  onLiveMode,
  onNavigateToLibrary,
  onOpenSOP,
  freeSOPsRemaining = 3,
  isPro = false,
  onUpgrade
}) => {
  const canCreate = isPro || freeSOPsRemaining > 0;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [createdSopId, setCreatedSopId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<'live' | 'upload' | 'youtube' | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [ytMetadata, setYtMetadata] = useState<{ title: string; author: string } | null>(null);
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [detailLevel, setDetailLevel] = useState<'quick' | 'normal' | 'detailed'>('normal');

  // Detail level presets based on OpenAI recommendations
  const detailPresets = {
    quick: { threshold: 0.45, minFrames: 6, maxFrames: 12, label: 'Snabb', desc: '6-12 steg' },
    normal: { threshold: 0.30, minFrames: 12, maxFrames: 25, label: 'Normal', desc: '12-25 steg' },
    detailed: { threshold: 0.20, minFrames: 20, maxFrames: 50, label: 'Detaljerad', desc: '20-50 steg' }
  };

  const currentPreset = detailPresets[detailLevel];
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [pipelineStage, setPipelineStage] = useState<'idle' | 'extracting' | 'uploading' | 'analyzing' | 'generating'>('idle');
  const [log, setLog] = useState<string[]>([]);
  const [detectedTags, setDetectedTags] = useState<string[]>([]);

  // Recording State
  const [recordingMode, setRecordingMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  // Fix: Reference MediaRecorder via any to bypass missing DOM types
  const mediaRecorderRef = useRef<any>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  // Fix: Reference MediaStream via any to bypass missing DOM types
  const streamRef = useRef<any>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    console.log('[FrameOps]', msg);
    setLog(prev => [msg, ...prev].slice(0, 5));
  };

  // Auto-navigate to created SOP after completion
  useEffect(() => {
    if (step === 3 && createdSopId) {
      const timer = setTimeout(() => {
        if (onOpenSOP) {
          onOpenSOP(createdSopId);
        } else if (onNavigateToLibrary) {
          onNavigateToLibrary();
        }
      }, 2000); // 2 second delay to show success message
      return () => clearTimeout(timer);
    }
  }, [step, createdSopId, onOpenSOP, onNavigateToLibrary]);

  useEffect(() => {
    const id = extractYoutubeId(youtubeUrl);
    if (id) {
      fetchYoutubeMetadata(id).then(data => {
        if (data) {
          setYtMetadata({ title: data.title, author: data.author });
          if (!title) setTitle(data.title);
          addLog(`YouTube Detected: ${data.title}`);
        }
      }).catch(() => addLog("YouTube metadata fetch skipped."));
    } else {
      setYtMetadata(null);
    }
  }, [youtubeUrl]);

  // Recording Logic
  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startCamera = async () => {
    try {
      // Fix: Use window.navigator as any to access mediaDevices
      const stream = await (window.navigator as any).mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (previewVideoRef.current) {
        // Fix: Cast current to any to set srcObject
        (previewVideoRef.current as any).srcObject = stream;
      }
      setRecordingMode(true);
    } catch (err) {
      console.error("Camera access error:", err);
      // Fix: Reference alert via window
      (window as any).alert("Please grant camera permissions to record video.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      // Fix: Cast stream to any to access getTracks
      (streamRef.current as any).getTracks().forEach((track: any) => track.stop());
      streamRef.current = null;
    }
    setRecordingMode(false);
  };

  const handleStartRecording = () => {
    if (!streamRef.current) return;
    recordedChunksRef.current = [];
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    // Fix: Access MediaRecorder via window
    if (!(window as any).MediaRecorder.isTypeSupported(options.mimeType)) {
      options.mimeType = 'video/webm';
    }
    
    // Fix: Access MediaRecorder via window
    const mediaRecorder = new (window as any).MediaRecorder(streamRef.current, options);
    mediaRecorder.ondataavailable = (e: any) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `capture_${Date.now()}.webm`, { type: 'video/webm' });
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(blob));
      if (!title) setTitle(`Live Capture ${new Date().toLocaleTimeString()}`);
      stopCamera();
    };
    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target as any).files?.[0];
    if (file) {
      setVideoFile(file);
      setVideoUrl(URL.createObjectURL(file));
      if (!title) setTitle(file.name.replace(/\.[^/.]+$/, ""));
    }
  };

  const handleGenerate = async () => {
    const ytId = extractYoutubeId(youtubeUrl);
    if (!videoUrl && !ytId) return;

    setIsProcessing(true);
    setProgress(5);
    addLog(`Using ${currentPreset.label} mode (${currentPreset.minFrames}-${currentPreset.maxFrames} frames, threshold ${currentPreset.threshold})`);

    try {
      let frames: string[] = [];
      let extractedFrames: ExtractedFrame[] = [];

      if (videoFile) {
        // CLEAN FLOW: FFmpeg for frames + Gemini native video for analysis
        // NO FALLBACKS - if something fails, it fails clearly

        setPipelineStage('extracting');
        addLog(`Step 1: Extracting frames with FFmpeg...`);
        setProgress(10);

        // Step 1: Extract frames with FFmpeg scene detection
        const sceneResult = await extractFramesFromUploadedVideo(
          videoFile,
          addLog,
          {
            sceneThreshold: currentPreset.threshold,
            maxFrames: currentPreset.maxFrames,
            minFrames: currentPreset.minFrames,
          }
        );

        if (!sceneResult.success || sceneResult.frames.length === 0) {
          throw new Error('FFmpeg scene detection failed - no frames returned');
        }

        addLog(`FFmpeg extracted ${sceneResult.frames.length} scene-detected frames`);
        extractedFrames = sceneResult.frames;
        setProgress(30);

        // Step 2: Use Gemini native video analysis (watches video + listens to audio)
        setPipelineStage('uploading');
        addLog(`Step 2: Uploading to Gemini for native video+audio analysis...`);
        const nativeResult = await analyzeVideoNative(
          videoFile,
          title || "New Procedure",
          extractedFrames,
          addLog
        );

        setProgress(90);
        setPipelineStage('generating');

        // Build SOP from native result (steps already have matched thumbnails)
        const newSop: SOP = {
          id: crypto.randomUUID(),
          title: nativeResult.title || title || "New Procedure",
          description: nativeResult.description || `SOP for ${title}`,
          createdAt: new Date().toISOString(),
          ppeRequirements: nativeResult.ppeRequirements || [],
          materialsRequired: nativeResult.materialsRequired || [],
          steps: nativeResult.steps.map((s, idx) => ({
            id: s.id || `step-${idx + 1}`,
            timestamp: s.timestamp || '00:00',
            title: s.title,
            description: s.description,
            safetyWarnings: s.safetyWarnings || [],
            toolsRequired: s.toolsRequired || [],
            thumbnail: s.thumbnail || extractedFrames[0]?.imageBase64 || ''
          })),
          sourceType: 'upload',
          status: 'completed',
          thumbnail_url: nativeResult.steps[0]?.thumbnail || extractedFrames[0]?.imageBase64 || '',
          allFrames: nativeResult.allFrames || []
        };

        addLog(`SOP generated: ${newSop.steps.length} steps with Gemini native video understanding`);
        setProgress(100);
        onComplete(newSop);
        setCreatedSopId(newSop.id);
        setIsProcessing(false);
        setStep(3);
        return;
      }

      if (ytId) {
        // CLEAN FLOW: Same as upload - download video, upload to Gemini native
        // Gemini watches AND listens to the video for best quality

        setPipelineStage('extracting');
        addLog(`Step 1: Downloading YouTube video and analyzing with Gemini native...`);
        setProgress(10);

        const nativeResult = await analyzeYoutubeNative(
          youtubeUrl,
          title || ytMetadata?.title || "YouTube Procedure",
          addLog,
          {
            sceneThreshold: currentPreset.threshold,
            maxFrames: currentPreset.maxFrames,
            minFrames: currentPreset.minFrames,
          }
        );

        setProgress(90);
        setPipelineStage('generating');

        // Build SOP from native result (steps already have matched thumbnails)
        const newSop: SOP = {
          id: crypto.randomUUID(),
          title: nativeResult.title || title || "YouTube Procedure",
          description: nativeResult.description || `SOP for ${title}`,
          createdAt: new Date().toISOString(),
          ppeRequirements: nativeResult.ppeRequirements || [],
          materialsRequired: nativeResult.materialsRequired || [],
          steps: nativeResult.steps.map((s, idx) => ({
            id: s.id || `step-${idx + 1}`,
            timestamp: s.timestamp || '00:00',
            title: s.title,
            description: s.description,
            safetyWarnings: s.safetyWarnings || [],
            toolsRequired: s.toolsRequired || [],
            thumbnail: s.thumbnail || ''
          })),
          sourceType: 'youtube',
          sourceUrl: youtubeUrl,
          status: 'completed',
          thumbnail_url: nativeResult.steps[0]?.thumbnail || '',
          allFrames: nativeResult.allFrames || []
        };

        addLog(`SOP generated: ${newSop.steps.length} steps with Gemini native video+audio understanding`);
        setProgress(100);
        onComplete(newSop);
        setCreatedSopId(newSop.id);
        setIsProcessing(false);
        setStep(3);
        return;
      }

    } catch (err: any) {
      console.error(err);
      addLog(`Pipeline Error: ${err.message}`);
      setIsProcessing(false);
      setPipelineStage('idle');
    }
  };

  const ytId = extractYoutubeId(youtubeUrl);

  return (
    <div className="max-w-4xl mx-auto py-8">
      {/* Step Indicator */}
      <div className="flex items-center justify-between mb-12 px-4">
        {[1, 2, 3].map((s) => (
          <React.Fragment key={s}>
            <div className="flex flex-col items-center gap-2">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black transition-all duration-500 ${
                step === s ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-500/40 ring-4 ring-indigo-50' : 
                step > s ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500 shadow-inner'
              }`}>
                {step > s ? <i className="fas fa-check"></i> : s}
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest ${step === s ? 'text-indigo-600' : 'text-slate-400'}`}>
                {s === 1 ? 'Source' : s === 2 ? 'Understanding' : 'Finalize'}
              </span>
            </div>
            {s < 3 && <div className={`flex-1 h-1 mx-4 rounded-full ${step > s ? 'bg-emerald-500' : 'bg-slate-200'}`}></div>}
          </React.Fragment>
        ))}
      </div>

      {step === 1 && (
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-slate-200 border border-slate-100 animate-in slide-in-from-bottom-8 duration-700">
          <div className="mb-8 flex justify-between items-start">
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight">Standard Operating Procedure</h2>
              <p className="text-slate-500 font-medium">Capture high-fidelity workflows via FFmpeg & Gemini 3 Pro.</p>
            </div>
            {videoFile && (
              <div className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                <i className="fas fa-check-circle"></i>
                Content Buffered
              </div>
            )}
          </div>

          {/* Free tier limit reached */}
          {!canCreate && (
            <div className="mb-8 p-6 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="fas fa-crown text-amber-600 text-xl"></i>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 mb-1">You've used your 3 free SOPs</h3>
                  <p className="text-slate-600 text-sm mb-4">Upgrade to Pro for unlimited SOPs, PDF export and more.</p>
                  <button
                    onClick={onUpgrade}
                    className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors"
                  >
                    <i className="fas fa-rocket mr-2"></i>
                    Upgrade to Pro
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Free SOPs remaining badge */}
          {canCreate && !isPro && (
            <div className="mb-6 flex items-center gap-2">
              <span className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                <i className="fas fa-gift mr-1.5"></i>
                {freeSOPsRemaining} free SOP{freeSOPsRemaining !== 1 ? 's' : ''} remaining
              </span>
            </div>
          )}

          {/* Source Type Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {/* Live Recording Card */}
            <button
              type="button"
              onClick={() => setSourceType('live')}
              className={`group relative rounded-2xl p-6 text-center transition-all ${
                sourceType === 'live'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-2 ring-indigo-600 ring-offset-2'
                  : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent hover:border-indigo-200'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 transition-all ${
                sourceType === 'live' ? 'bg-white/20' : 'bg-slate-200 group-hover:bg-indigo-100'
              }`}>
                <i className={`fas fa-video text-lg ${sourceType === 'live' ? 'text-white' : 'text-slate-500 group-hover:text-indigo-600'}`}></i>
              </div>
              <p className={`text-sm font-bold ${sourceType === 'live' ? 'text-white' : 'text-slate-900'}`}>Live</p>
              <p className={`text-[10px] mt-1 ${sourceType === 'live' ? 'text-indigo-200' : 'text-slate-400'}`}>Spela in nu</p>
            </button>

            {/* Upload Card */}
            <button
              type="button"
              onClick={() => setSourceType('upload')}
              className={`group relative rounded-2xl p-6 text-center transition-all ${
                sourceType === 'upload'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-2 ring-indigo-600 ring-offset-2'
                  : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent hover:border-indigo-200'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 transition-all ${
                sourceType === 'upload' ? 'bg-white/20' : 'bg-slate-200 group-hover:bg-indigo-100'
              }`}>
                <i className={`fas fa-cloud-upload-alt text-lg ${sourceType === 'upload' ? 'text-white' : 'text-slate-500 group-hover:text-indigo-600'}`}></i>
              </div>
              <p className={`text-sm font-bold ${sourceType === 'upload' ? 'text-white' : 'text-slate-900'}`}>Ladda upp</p>
              <p className={`text-[10px] mt-1 ${sourceType === 'upload' ? 'text-indigo-200' : 'text-slate-400'}`}>MP4, MOV, WebM</p>
            </button>

            {/* YouTube Card */}
            <button
              type="button"
              onClick={() => setSourceType('youtube')}
              className={`group relative rounded-2xl p-6 text-center transition-all ${
                sourceType === 'youtube'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 ring-2 ring-indigo-600 ring-offset-2'
                  : 'bg-slate-50 hover:bg-slate-100 border-2 border-transparent hover:border-indigo-200'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 transition-all ${
                sourceType === 'youtube' ? 'bg-white/20' : 'bg-slate-200 group-hover:bg-rose-100'
              }`}>
                <i className={`fab fa-youtube text-lg ${sourceType === 'youtube' ? 'text-white' : 'text-rose-500'}`}></i>
              </div>
              <p className={`text-sm font-bold ${sourceType === 'youtube' ? 'text-white' : 'text-slate-900'}`}>YouTube</p>
              <p className={`text-[10px] mt-1 ${sourceType === 'youtube' ? 'text-indigo-200' : 'text-slate-400'}`}>Klistra in länk</p>
            </button>
          </div>

          {/* Expandable Input Area */}
          {sourceType && (
            <div className="mb-8 animate-in slide-in-from-top-4 duration-300">
              {/* Live - Start Recording */}
              {sourceType === 'live' && (
                <div
                  onClick={onLiveMode || startCamera}
                  className="border-2 border-dashed border-indigo-300 bg-indigo-50/50 rounded-2xl p-8 text-center cursor-pointer hover:bg-indigo-50 transition-all"
                >
                  <div className="w-16 h-16 bg-rose-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-rose-200">
                    <i className="fas fa-circle text-2xl"></i>
                  </div>
                  <p className="text-lg font-bold text-slate-900">Starta inspelning</p>
                  <p className="text-sm text-slate-500 mt-1">Klicka för att öppna kameran och börja spela in</p>
                </div>
              )}

              {/* Upload - Drag & Drop Area */}
              {sourceType === 'upload' && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    videoFile
                      ? 'border-emerald-400 bg-emerald-50'
                      : 'border-indigo-300 bg-indigo-50/50 hover:bg-indigo-50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {videoFile ? (
                    <>
                      <div className="w-16 h-16 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-200">
                        <i className="fas fa-check text-2xl"></i>
                      </div>
                      <p className="text-lg font-bold text-slate-900">{videoFile.name}</p>
                      <p className="text-sm text-slate-500 mt-1">
                        {(videoFile.size / 1024 / 1024).toFixed(1)} MB • Klicka för att byta fil
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-16 h-16 bg-indigo-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                        <i className="fas fa-cloud-upload-alt text-2xl"></i>
                      </div>
                      <p className="text-lg font-bold text-slate-900">Dra och släpp video här</p>
                      <p className="text-sm text-slate-500 mt-1">eller klicka för att välja fil</p>
                    </>
                  )}
                </div>
              )}

              {/* YouTube - URL Input */}
              {sourceType === 'youtube' && (
                <div className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Klistra in YouTube-länk här..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl((e.target as any).value)}
                      className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-200 rounded-xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all text-sm font-medium"
                    />
                    <i className="fab fa-youtube absolute left-4 top-1/2 -translate-y-1/2 text-rose-500 text-xl"></i>
                  </div>
                  {ytMetadata && ytId && (
                    <div className="flex items-center gap-4 p-4 bg-slate-900 rounded-xl text-white">
                      <img
                        src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                        className="w-32 h-20 object-cover rounded-lg"
                        onError={(e) => ((e.currentTarget as any).src = `https://img.youtube.com/vi/${ytId}/0.jpg`)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate">{ytMetadata.title}</p>
                        <p className="text-xs text-slate-400 mt-1">{ytMetadata.author}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <i className="fas fa-check-circle text-emerald-400"></i>
                          <span className="text-xs text-emerald-400">Redo att analysera</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Recording UI Overlay */}
          {recordingMode && (
            <div className="fixed inset-0 z-[100] bg-slate-900 flex flex-col items-center justify-center p-6 animate-in fade-in duration-300">
              <div className="w-full max-w-4xl bg-black rounded-[3rem] overflow-hidden relative shadow-2xl ring-8 ring-white/5">
                <video ref={previewVideoRef} autoPlay muted playsInline className="w-full aspect-video object-cover" />
                
                <div className="absolute top-8 left-8 flex items-center gap-4">
                  <div className="px-4 py-2 bg-black/60 backdrop-blur-xl rounded-2xl flex items-center gap-3 border border-white/10">
                    <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-rose-500 animate-pulse' : 'bg-slate-400'}`}></div>
                    <span className="text-white text-xs font-black uppercase tracking-[0.2em]">{isRecording ? 'Recording' : 'Standby'}</span>
                  </div>
                  {isRecording && (
                    <div className="px-4 py-2 bg-rose-600 text-white rounded-2xl text-xs font-black tabular-nums">
                      {formatTime(recordingTime)}
                    </div>
                  )}
                </div>

                <div className="absolute bottom-8 left-0 right-0 flex items-center justify-center gap-6">
                  <button
                    onClick={stopCamera}
                    disabled={isRecording}
                    className="w-14 h-14 bg-white/10 text-white rounded-full flex items-center justify-center backdrop-blur hover:bg-white/20 transition-all disabled:opacity-30"
                    aria-label="Close camera"
                  >
                    <i className="fas fa-times text-xl"></i>
                  </button>
                  
                  {!isRecording ? (
                    <button 
                      onClick={handleStartRecording}
                      className="w-20 h-20 bg-white rounded-full flex items-center justify-center group hover:scale-110 transition-all"
                    >
                      <div className="w-8 h-8 bg-rose-600 rounded-full group-active:scale-90 transition-transform"></div>
                    </button>
                  ) : (
                    <button 
                      onClick={handleStopRecording}
                      className="w-20 h-20 bg-white rounded-full flex items-center justify-center group hover:scale-110 transition-all"
                    >
                      <div className="w-8 h-8 bg-black rounded-lg group-active:scale-90 transition-transform"></div>
                    </button>
                  )}
                  
                  <div className="w-14 h-14"></div> {/* Placeholder for balance */}
                </div>
              </div>
              <p className="mt-8 text-slate-500 text-[10px] font-black uppercase tracking-[0.3em]">Direct Vision Capture Active</p>
            </div>
          )}

          <div className="space-y-6 mb-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-4">
                <label className="block text-xs font-black text-slate-900 uppercase tracking-widest">Procedural Info</label>
                <input type="text" placeholder="Procedure Title" value={title} onChange={(e) => setTitle((e.target as any).value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all font-bold text-sm mb-4" />
                <textarea rows={3} placeholder="Add equipment manuals or specific safety instructions..." value={context} onChange={(e) => setContext((e.target as any).value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 outline-none transition-all resize-none font-medium text-sm"></textarea>
              </div>
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-[2rem] border border-indigo-100 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                    <i className="fas fa-comment-dots text-indigo-600"></i>
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-900 uppercase tracking-widest">Beta Feedback</p>
                    <p className="text-[10px] text-slate-500">Hjälp oss bli bättre!</p>
                  </div>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Något som inte fungerar? Saknar du en funktion? Vi vill höra från dig!
                </p>
                <a
                  href="mailto:feedback@frameops.ai?subject=FrameOps%20Feedback"
                  className="block w-full py-3 bg-white text-indigo-600 font-bold text-xs text-center rounded-xl border border-indigo-200 hover:bg-indigo-50 transition-colors"
                >
                  <i className="fas fa-envelope mr-2"></i>
                  Skicka feedback
                </a>
              </div>
            </div>
          </div>

          <button disabled={!canCreate || (!videoUrl && !youtubeUrl) || isProcessing} onClick={() => setStep(2)} className="w-full py-5 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-indigo-700 disabled:opacity-30 shadow-xl shadow-indigo-600/30 transition-all active:scale-[0.98]">
            {canCreate ? 'Start Multimodal Analysis' : 'Upgrade to Continue'}
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl border border-slate-100">
          <div className="max-w-2xl mx-auto">
            {/* Video Preview */}
            <div className="aspect-video bg-slate-900 rounded-[2rem] overflow-hidden relative shadow-2xl mb-8">
              {videoUrl ? <video ref={videoRef} src={videoUrl} className="w-full h-full object-contain" /> : (
                <div className="w-full h-full relative">
                   <img src={`https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`} className="w-full h-full object-cover" />
                   {isProcessing && (
                     <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                       <div className="text-center text-white">
                         <div className="w-16 h-16 border-4 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
                         <p className="text-sm font-bold">Analyzing video...</p>
                       </div>
                     </div>
                   )}
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />
            </div>

            {/* Progress Section */}
            {isProcessing ? (
              <div className="text-center space-y-6">
                {/* Pipeline Steps */}
                <div className="space-y-3 text-left">
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      pipelineStage === 'extracting' ? 'bg-indigo-600 text-white' :
                      ['uploading', 'analyzing', 'generating'].includes(pipelineStage) ? 'bg-emerald-500 text-white' :
                      'bg-slate-200 text-slate-400'
                    }`}>
                      {['uploading', 'analyzing', 'generating'].includes(pipelineStage) ? <i className="fas fa-check"></i> : '1'}
                    </div>
                    <span className={`text-sm font-medium ${pipelineStage === 'extracting' ? 'text-indigo-600' : 'text-slate-500'}`}>
                      Extraherar nyckelbilder...
                      {pipelineStage === 'extracting' && <i className="fas fa-spinner fa-spin ml-2"></i>}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      pipelineStage === 'uploading' ? 'bg-indigo-600 text-white' :
                      ['analyzing', 'generating'].includes(pipelineStage) ? 'bg-emerald-500 text-white' :
                      'bg-slate-200 text-slate-400'
                    }`}>
                      {['analyzing', 'generating'].includes(pipelineStage) ? <i className="fas fa-check"></i> : '2'}
                    </div>
                    <span className={`text-sm font-medium ${pipelineStage === 'uploading' ? 'text-indigo-600' : 'text-slate-500'}`}>
                      Laddar upp till Gemini...
                      {pipelineStage === 'uploading' && <i className="fas fa-spinner fa-spin ml-2"></i>}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                      pipelineStage === 'generating' ? 'bg-indigo-600 text-white' :
                      'bg-slate-200 text-slate-400'
                    }`}>
                      3
                    </div>
                    <span className={`text-sm font-medium ${pipelineStage === 'generating' ? 'text-indigo-600' : 'text-slate-500'}`}>
                      Genererar SOP-steg...
                      {pipelineStage === 'generating' && <i className="fas fa-spinner fa-spin ml-2"></i>}
                    </span>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-700 rounded-full" style={{ width: `${progress}%` }}></div>
                  </div>
                  <p className="text-slate-400 text-xs">Detta tar vanligtvis 30-60 sekunder</p>
                </div>
              </div>
            ) : (
              <div className="text-center space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">Ready to analyze</h3>
                  <p className="text-slate-500">We'll extract key frames and generate step-by-step instructions</p>
                </div>
                <div className="flex gap-4 justify-center">
                  <button onClick={() => setStep(1)} className="px-6 py-3 border border-slate-200 rounded-xl font-medium text-slate-500 hover:bg-slate-50 transition-colors">
                    Back
                  </button>
                  <button onClick={handleGenerate} className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 transition-all">
                    Generate SOP
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white p-10 rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-700">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <i className="fas fa-check-double text-3xl"></i>
            </div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2 uppercase">SOP Skapad!</h2>
            <p className="text-slate-500 font-medium max-w-sm mx-auto">Din SOP är redo. Granska och förbättra den för bästa resultat.</p>
          </div>

          {/* Tip box */}
          <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 mb-8">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <i className="fas fa-lightbulb text-amber-600"></i>
              </div>
              <div>
                <h3 className="font-bold text-amber-900 mb-1">Tips: Gör din SOP perfekt</h3>
                <ul className="text-sm text-amber-800 space-y-1">
                  <li><i className="fas fa-check text-amber-600 mr-2"></i>Granska att alla steg är korrekta</li>
                  <li><i className="fas fa-check text-amber-600 mr-2"></i>Byt ut bilder som inte matchar</li>
                  <li><i className="fas fa-check text-amber-600 mr-2"></i>Använd <strong>✨ AI Förbättra</strong> för professionell text</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button onClick={() => { setStep(1); setCreatedSopId(null); setPipelineStage('idle'); }} className="px-6 py-4 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors order-3 sm:order-1">
              <i className="fas fa-plus mr-2"></i>Ny SOP
            </button>
            <button onClick={() => createdSopId && onOpenSOP ? onOpenSOP(createdSopId) : onNavigateToLibrary?.()} className="px-6 py-4 bg-slate-200 text-slate-800 font-bold rounded-xl hover:bg-slate-300 transition-colors order-2">
              <i className="fas fa-eye mr-2"></i>Visa SOP
            </button>
            <button onClick={() => createdSopId && onOpenSOP ? onOpenSOP(createdSopId) : onNavigateToLibrary?.()} className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-black uppercase tracking-wider text-sm rounded-xl shadow-xl shadow-indigo-600/30 hover:from-indigo-700 hover:to-purple-700 transition-all order-1 sm:order-3">
              <i className="fas fa-edit mr-2"></i>Redigera & Förbättra
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SOPGenerator;
