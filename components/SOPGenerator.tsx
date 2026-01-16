
import React, { useState, useRef, useEffect } from 'react';
import { SOP, SOPStep } from '../types';
import { analyzeSOPFrames } from '../services/geminiService';
import { detectIndustrialObjects } from '../services/visionService';
import { extractYoutubeId, fetchYoutubeMetadata, extractFramesWithSceneDetection, extractFramesFromUploadedVideo, getYoutubeTranscript, analyzeVideoNative, ExtractedFrame } from '../services/youtubeService';

interface SOPGeneratorProps {
  onComplete: (sop: SOP) => void;
  onLiveMode?: () => void;
}

const SOPGenerator: React.FC<SOPGeneratorProps> = ({ onComplete, onLiveMode }) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
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
        addLog(`Step 2: Uploading to Gemini for native video+audio analysis...`);
        const nativeResult = await analyzeVideoNative(
          videoFile,
          title || "New Procedure",
          extractedFrames,
          addLog
        );

        setProgress(90);

        // Build SOP from native result (steps already have matched thumbnails)
        const newSop: SOP = {
          id: crypto.randomUUID(),
          title: nativeResult.title || title || "New Procedure",
          description: nativeResult.description || `SOP for ${title}`,
          createdAt: new Date(),
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
          source: 'upload',
          thumbnail: nativeResult.steps[0]?.thumbnail || extractedFrames[0]?.imageBase64 || ''
        };

        addLog(`SOP generated: ${newSop.steps.length} steps with Gemini native video understanding`);
        setProgress(100);
        onComplete(newSop);
        setIsProcessing(false);
        return;
      }

      if (ytId) {
        addLog(`Connecting to Railway FFmpeg scene detection...`);
        setProgress(10);

        try {
          // Use Railway backend for proper scene detection
          const sceneResult = await extractFramesWithSceneDetection(
            youtubeUrl,
            addLog,
            {
              sceneThreshold: currentPreset.threshold,
              maxFrames: currentPreset.maxFrames,
              minFrames: currentPreset.minFrames,
            }
          );

          if (sceneResult.success && sceneResult.frames.length > 0) {
            addLog(`Railway extracted ${sceneResult.frames.length} scene-detected frames`);
            extractedFrames = sceneResult.frames; // Keep full frame data for VIT matching
            frames = sceneResult.frames.map(f => f.imageBase64);
            setProgress(40);
          } else {
            throw new Error('No frames returned from Railway');
          }
        } catch (railwayError: any) {
          addLog(`Railway error: ${railwayError.message}`);
          addLog(`Scene detection requires Railway backend to be running`);
          throw new Error(`YouTube scene detection failed. Make sure Railway service is running.`);
        }
      }

      // YouTube: Fetch transcript with timestamps (segments)
      let transcript = '';
      let segments: { start: number; end: number; text: string }[] = [];

      addLog("Fetching YouTube transcript...");
      try {
        const transcriptResult = await getYoutubeTranscript(youtubeUrl, addLog);
        transcript = transcriptResult.transcript;
        segments = transcriptResult.segments || [];
        if (transcript && transcript.length > 0) {
          addLog(`Transcript loaded: ${transcript.length} chars, ${segments.length} segments (${transcriptResult.source})`);
        } else {
          addLog("No transcript available - video may lack subtitles");
        }
      } catch (e: any) {
        addLog("Transcript fetch failed - continuing with visual analysis only");
      }
      setProgress(50);

      const tags: string[] = [];
      setDetectedTags(tags);
      setProgress(60);

      // Build context: match transcript segments to frame timestamps + full transcript
      let fullContext = context;
      if (segments.length > 0 && extractedFrames.length > 0) {
        // Create per-frame transcript context with WIDER window (±8 seconds)
        const frameContexts = extractedFrames.map((frame, idx) => {
          const frameTime = frame.timestampSeconds;
          // Find segments that overlap with this frame (±8 seconds window for better coverage)
          const relevantSegments = segments.filter(seg =>
            seg.start <= frameTime + 8 && seg.end >= frameTime - 8
          );
          const segmentText = relevantSegments.map(s => s.text).join(' ').trim();
          return `Frame ${idx + 1} (${frame.timestamp}): "${segmentText || 'no speech'}"`;
        });

        // Also include FULL transcript so Gemini can see ALL instructions
        const fullTranscript = segments.map(s => s.text).join(' ');
        fullContext = `${context}\n\nFULL TRANSCRIPT (use this to ensure NO steps are missed):\n${fullTranscript.substring(0, 10000)}\n\nTRANSCRIPT MATCHED TO FRAMES:\n${frameContexts.join('\n')}`;
        addLog(`Matched ${segments.length} segments to ${extractedFrames.length} frames (full transcript included)`);
      } else if (transcript) {
        // Fallback: use full transcript without timestamps
        fullContext = `${context}\n\nVIDEO TRANSCRIPT:\n${transcript.substring(0, 15000)}`;
      }

      console.log('[FrameOps] Full context length:', fullContext.length);
      addLog(transcript ? "Analyzing with transcript..." : "Analyzing frames only (no transcript)...");

      const result = await analyzeSOPFrames(frames, title || "New Procedure", fullContext, tags);

      setProgress(90);

      // Direct 1:1 mapping: step[i] corresponds to frame[i]
      // Gemini was told to generate exactly N steps for N frames in order
      addLog(`Mapping ${result.steps.length} steps to ${frames.length} frames (1:1)...`);

      const finalSteps = result.steps.map((s, idx) => ({
        ...s,
        thumbnail: frames[idx] || frames[frames.length - 1],
        timestamp: extractedFrames[idx]?.timestamp || s.timestamp
      }));

      addLog(`Mapped ${finalSteps.length} steps with thumbnails`);

      setProgress(95);

      // Use Gemini-selected best thumbnail, fallback to ~33% into video
      const bestThumbnailIdx = typeof result.bestThumbnailIndex === 'number'
        ? result.bestThumbnailIndex
        : Math.floor(frames.length / 3);
      const thumbnailUrl = frames[bestThumbnailIdx] || frames[Math.floor(frames.length / 3)] || frames[0];
      addLog(`Using frame ${bestThumbnailIdx} as cover image (Gemini selected)`);

      const newSOP: SOP = {
        id: Math.random().toString(36).substr(2, 9),
        title: result.title,
        description: result.description,
        ppeRequirements: result.ppeRequirements,
        materialsRequired: result.materialsRequired,
        createdAt: new Date().toISOString(),
        sourceType: 'youtube',
        sourceUrl: youtubeUrl,
        status: 'completed',
        thumbnail_url: thumbnailUrl,
        steps: finalSteps
      };

      onComplete(newSOP);
      setProgress(100);
      setTimeout(() => { setStep(3); setIsProcessing(false); }, 1000);

    } catch (err: any) {
      console.error(err);
      addLog(`Pipeline Error: ${err.message}`);
      setIsProcessing(false);
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
          
          {/* Source Type Selection */}
          <div className="grid grid-cols-3 gap-4 mb-6">
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
              <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-200 space-y-5">
                <label className="text-xs font-black text-slate-900 uppercase tracking-widest block">Detaljnivå</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['quick', 'normal', 'detailed'] as const).map((level) => {
                    const preset = detailPresets[level];
                    const isSelected = detailLevel === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setDetailLevel(level)}
                        className={`p-3 rounded-xl text-center transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                            : 'bg-white border border-slate-200 text-slate-600 hover:border-indigo-300'
                        }`}
                      >
                        <div className="text-xs font-black uppercase">{preset.label}</div>
                        <div className={`text-[9px] mt-1 ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                          {preset.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-slate-500 font-medium leading-relaxed">
                  {detailLevel === 'quick' && 'Snabb genomgång - perfekt för enkla processer'}
                  {detailLevel === 'normal' && 'Balanserad nivå - rekommenderad för de flesta videor'}
                  {detailLevel === 'detailed' && 'Omfattande dokumentation - fångar varje detalj'}
                </p>
              </div>
            </div>
          </div>

          <button disabled={(!videoUrl && !youtubeUrl) || isProcessing} onClick={() => setStep(2)} className="w-full py-5 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-indigo-700 disabled:opacity-30 shadow-xl shadow-indigo-600/30 transition-all active:scale-[0.98]">
            Start Multimodal Analysis
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
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-sm">
                    <span className="font-medium text-slate-600">Creating your SOP...</span>
                    <span className="font-bold text-indigo-600">{progress}%</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-700 rounded-full" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
                <p className="text-slate-400 text-sm">This usually takes 30-60 seconds</p>
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
        <div className="text-center bg-white p-16 rounded-[3rem] shadow-2xl animate-in zoom-in-95 duration-700">
          <div className="w-20 h-20 bg-emerald-50 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <i className="fas fa-check-double text-3xl"></i>
          </div>
          <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-2 uppercase">Analysis Successful</h2>
          <p className="text-slate-500 font-medium mb-10 max-w-sm mx-auto">Procedural mapping complete. Documentation stored in library.</p>
          <div className="flex justify-center gap-4">
            <button onClick={() => setStep(1)} className="px-8 py-4 bg-slate-100 text-slate-700 font-black uppercase tracking-widest text-[10px] rounded-xl">New Procedure</button>
            <button onClick={() => (window as any).location.hash = '#library'} className="px-8 py-4 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-xl shadow-xl shadow-indigo-600/30">Go to Library</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SOPGenerator;
