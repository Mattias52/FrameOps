import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SOP, SOPStep } from '../types';
import { analyzeSOPFrames, transcribeAudioFile } from '../services/geminiService';

interface LiveSOPGeneratorProps {
  onComplete: (sop: SOP) => void;
  onCancel: () => void;
  freeSOPsRemaining?: number;
  isPro?: boolean;
  onUpgrade?: () => void;
}

interface LiveStep {
  id: string;
  timestamp: string;
  timestampSeconds: number;
  thumbnail: string;
  title: string;
  description: string;
  status: 'capturing' | 'analyzing' | 'complete';
}

const LiveSOPGenerator: React.FC<LiveSOPGeneratorProps> = ({
  onComplete,
  onCancel,
  freeSOPsRemaining = 3,
  isPro = false,
  onUpgrade
}) => {
  const canCreate = isPro || freeSOPsRemaining > 0;

  // Recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Live SOP state
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [title, setTitle] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  // Speech recognition state
  const [isListening, setIsListening] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState<string | null>(null);

  // Mobile state
  const [showStepsPanel, setShowStepsPanel] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Fullscreen image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Camera permission state (iOS Safari requires user gesture to start camera)
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Scene detection settings (user-controllable)
  const [sceneSensitivity, setSceneSensitivity] = useState(50); // 0-100, 50 = balanced
  const [showSettings, setShowSettings] = useState(false);

  // AI Director state
  const [directorMode, setDirectorMode] = useState(false);
  const [directorTip, setDirectorTip] = useState<string | null>(null);
  const [directorIssue, setDirectorIssue] = useState<string | null>(null);
  const [directorSeverity, setDirectorSeverity] = useState<'low' | 'medium' | 'high' | null>(null);
  const [directorLoading, setDirectorLoading] = useState(false);
  const previousTipsRef = useRef<string[]>([]);
  const lastProactiveCheckRef = useRef<number>(0);
  const PROACTIVE_CHECK_INTERVAL = 5000; // Check every 5 seconds in proactive mode

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Audio recording state (for iOS Safari fallback)
  const [audioRecordingActive, setAudioRecordingActive] = useState(false);
  const [hasAudioFallback, setHasAudioFallback] = useState(false);

  // Refs
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const lastFrameRef = useRef<string | null>(null);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const allFramesRef = useRef<{ timestamp: number; image: string }[]>([]);
  const recordingTimeRef = useRef(0);
  const speechRecognitionRef = useRef<any>(null);
  const transcriptRef = useRef<string>('');
  // Audio-only recorder for iOS Safari fallback (when Web Speech API unavailable)
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);

  // Scene detection settings
  const FRAME_INTERVAL_MS = 1000; // Check for scene change every 1 second
  // Convert sensitivity (0-100) to threshold: high sensitivity = low threshold
  // sensitivity 0 = threshold 0.20 (very few frames - only major changes)
  // sensitivity 50 = threshold 0.08 (balanced - captures more)
  // sensitivity 100 = threshold 0.02 (many frames - capture small changes)
  const SCENE_THRESHOLD = 0.20 - (sceneSensitivity / 100) * 0.18;
  // Minimum seconds between captures (even if scene changes)
  // sensitivity 0 = 8 sec, sensitivity 50 = 4 sec, sensitivity 100 = 1.5 sec
  const MIN_CAPTURE_INTERVAL = Math.max(1.5, 8 - (sceneSensitivity / 100) * 6.5);
  const MAX_FRAMES = 60; // Max frames to capture (increased)

  // Start camera with video + audio
  // NOTE: On iOS Safari, this MUST be called from a user gesture (button click)
  const startCamera = async () => {
    setCameraError(null);

    // Check if mediaDevices is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('MediaDevices API not available');
      setCameraError('Camera not supported in this browser. Ensure you are using HTTPS.');
      return;
    }

    try {
      console.log('Requesting camera access...');

      // Detect if mobile device
      const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      console.log('Device:', isMobileDevice ? (isIOS ? 'iOS' : 'Android') : 'Desktop');

      // Helper function to get media with timeout
      const getUserMediaWithTimeout = (constraints: MediaStreamConstraints, timeoutMs: number): Promise<MediaStream> => {
        return Promise.race([
          navigator.mediaDevices.getUserMedia(constraints),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Camera access timed out. Please check camera permissions.')), timeoutMs)
          )
        ]);
      };

      // Longer timeout for mobile (can be slower)
      const timeout = isMobileDevice ? 30000 : 20000;

      // AUDIO IS REQUIRED - Gemini needs audio for transcription
      let stream: MediaStream;
      try {
        // First try with environment camera (back camera on mobile)
        stream = await getUserMediaWithTimeout({
          video: {
            facingMode: 'environment',
            width: { ideal: isMobileDevice ? 1280 : 1920 },
            height: { ideal: isMobileDevice ? 720 : 1080 },
            // @ts-ignore - focusMode is not in standard types yet
            advanced: [{ focusMode: 'continuous' }]
          },
          audio: true  // REQUIRED for Gemini transcription
        }, timeout);
      } catch (envError: any) {
        console.log('Environment camera failed:', envError.message, '- trying any camera with audio...');

        // Fallback to any camera BUT ALWAYS WITH AUDIO
        stream = await getUserMediaWithTimeout({
          video: true,
          audio: true  // REQUIRED for Gemini transcription
        }, timeout);
      }

      console.log('Camera access granted, tracks:', stream.getTracks().map(t => t.kind));
      streamRef.current = stream;
      if (videoRef.current) {
        console.log('Setting video srcObject...');
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready (with timeout to prevent hanging)
        console.log('Waiting for video metadata...');
        await new Promise<void>((resolve) => {
          const timeoutId = setTimeout(() => {
            console.log('Video metadata timeout - proceeding anyway');
            resolve();
          }, 2000);

          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              console.log('Video metadata loaded');
              clearTimeout(timeoutId);
              resolve();
            };
          } else {
            resolve();
          }
        });
      }
      
      console.log('Setting cameraStarted to true');
      setCameraStarted(true);
      console.log('Camera started successfully');
    } catch (err: any) {
      console.error("Camera access error:", err);

      // Detect device for better error messages
      const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      const isAndroid = /Android/i.test(navigator.userAgent);

      // Show the REAL error - no hiding it
      let errorMessage = `${err.name || 'Error'}: ${err.message}`;

      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMessage = 'No camera or microphone found. Both are required for Live SOP recording.';
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        if (isIOS) {
          errorMessage = 'Camera/Microphone permission denied. Go to Settings > Safari > Camera & Microphone and allow access.';
        } else if (isAndroid) {
          errorMessage = 'Camera/Microphone permission denied. Tap the lock icon in the address bar to allow access.';
        } else {
          errorMessage = 'Camera/Microphone permission denied. Please allow access in browser settings.';
        }
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        errorMessage = 'Camera/Microphone is in use by another app. Close other apps and try again.';
      } else if (err.name === 'OverconstrainedError') {
        errorMessage = 'Camera does not support the requested settings. Please try again.';
      } else if (err.message?.includes('timed out')) {
        if (isIOS) {
          errorMessage = 'Access timed out. Tap "Allow" when prompted for BOTH camera AND microphone. Check Settings > Safari if needed.';
        } else if (isAndroid) {
          errorMessage = 'Access timed out. Tap "Allow" when prompted for BOTH camera AND microphone permissions.';
        } else {
          errorMessage = 'Access timed out. Please allow BOTH camera AND microphone permissions when prompted.';
        }
      } else if (err.name === 'AbortError') {
        errorMessage = 'Access was interrupted. Please try again.';
      } else if (err.name === 'SecurityError') {
        errorMessage = 'Access blocked. This site must be accessed via HTTPS or localhost.';
      }

      setCameraError(errorMessage);
    }
  };

  // Cleanup on unmount (camera started manually via button click for iOS Safari)
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
      // Cleanup audio fallback
      if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
        audioRecorderRef.current.stop();
      }
    };
  }, []);

  // Recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          recordingTimeRef.current = prev + 1;
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Capture current frame as base64
  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Set canvas to 16:9 but handle source aspect ratio
    canvas.width = 1280;
    canvas.height = 720;
    
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    
    let drawWidth = canvas.width;
    let drawHeight = canvas.height;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspect > canvasAspect) {
      // Video is wider than canvas
      drawWidth = canvas.height * videoAspect;
      offsetX = -(drawWidth - canvas.width) / 2;
    } else {
      // Video is taller than canvas (like iPhone portrait)
      drawHeight = canvas.width / videoAspect;
      offsetY = -(drawHeight - canvas.height) / 2;
    }

    ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);
    return canvas.toDataURL('image/jpeg', 0.8);
  }, []);

  // Compare two frames to detect scene change
  const lastImageDataRef = useRef<Uint8ClampedArray | null>(null);

  const detectSceneChange = (currentData: ImageData): number => {
    if (!lastImageDataRef.current) {
      lastImageDataRef.current = new Uint8ClampedArray(currentData.data);
      return 1.0; // First frame is always a change
    }

    const data1 = lastImageDataRef.current;
    const data2 = currentData.data;
    let diff = 0;
    const step = 16; // Sample every 16th pixel for performance
    
    for (let i = 0; i < data1.length; i += 4 * step) {
      const r = Math.abs(data1[i] - data2[i]);
      const g = Math.abs(data1[i + 1] - data2[i + 1]);
      const b = Math.abs(data1[i + 2] - data2[i + 2]);
      diff += (r + g + b) / 3;
    }

    const avgDiff = diff / (data1.length / (4 * step));
    const normalizedDiff = avgDiff / 255;
    
    // Update last image data
    lastImageDataRef.current = new Uint8ClampedArray(data2);
    
    return normalizedDiff;
  };

  // Check if frame is blurry using Laplacian variance
  const isFrameBlurry = (imageData: ImageData): boolean => {
    const data = imageData.data;
    const width = imageData.width;
    let variance = 0;
    let count = 0;

    // Sample every 8th pixel for speed
    for (let y = 1; y < imageData.height - 1; y += 8) {
      for (let x = 1; x < width - 1; x += 8) {
        const idx = (y * width + x) * 4;
        // Grayscale value
        const center = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        const left = (data[idx - 4] + data[idx - 3] + data[idx - 2]) / 3;
        const right = (data[idx + 4] + data[idx + 5] + data[idx + 6]) / 3;
        const top = (data[idx - width * 4] + data[idx - width * 4 + 1] + data[idx - width * 4 + 2]) / 3;
        const bottom = (data[idx + width * 4] + data[idx + width * 4 + 1] + data[idx + width * 4 + 2]) / 3;

        // Laplacian
        const laplacian = Math.abs(4 * center - left - right - top - bottom);
        variance += laplacian * laplacian;
        count++;
      }
    }

    const avgVariance = variance / count;
    console.log('Frame variance:', avgVariance.toFixed(2));
    // Threshold for blur: 15 is stricter to catch motion blur in action shots
    return avgVariance < 15; 
  };

  // Apply sharpening filter to enhance blurry frames
  const sharpenFrame = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);
    
    // Sharpening kernel (unsharp mask)
    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) { // RGB only
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += copy[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          const idx = (y * width + x) * 4 + c;
          data[idx] = Math.max(0, Math.min(255, sum));
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
  };

  // Capture and analyze frame - uses refs to avoid stale closure
  // Store threshold in ref so callback always has current value
  const sceneThresholdRef = useRef(SCENE_THRESHOLD);
  sceneThresholdRef.current = SCENE_THRESHOLD;
  const minCaptureIntervalRef = useRef(MIN_CAPTURE_INTERVAL);
  minCaptureIntervalRef.current = MIN_CAPTURE_INTERVAL;
  const lastCaptureTimeRef = useRef(0);

  const captureAndAnalyze = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (video.paused || video.ended || video.readyState < 2) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Set canvas to 16:9 but handle source aspect ratio (Cover)
    canvas.width = 1280;
    canvas.height = 720;
    
    const videoAspect = video.videoWidth / video.videoHeight;
    const canvasAspect = canvas.width / canvas.height;
    
    let drawWidth = canvas.width;
    let drawHeight = canvas.height;
    let offsetX = 0;
    let offsetY = 0;

    if (videoAspect > canvasAspect) {
      drawWidth = canvas.height * videoAspect;
      offsetX = -(drawWidth - canvas.width) / 2;
    } else {
      drawHeight = canvas.width / videoAspect;
      offsetY = -(drawHeight - canvas.height) / 2;
    }

    ctx.drawImage(video, offsetX, offsetY, drawWidth, drawHeight);

    // Check for blur and scene change
    const imageData = ctx.getImageData(0, 0, 1280, 720);
    const blurry = isFrameBlurry(imageData);
    const diff = detectSceneChange(imageData);
    
    console.log(`Frame analysis: diff=${diff.toFixed(3)}, blurry=${blurry}`);

    // Logic:
    // 1. Always capture first frame
    // 2. Capture if scene changed significantly (diff > 0.1)
    // 3. Skip if too blurry (unless it's the first frame)
    
    const isFirstFrame = allFramesRef.current.length === 0;
    const currentThreshold = sceneThresholdRef.current;
    const minInterval = minCaptureIntervalRef.current;
    const timeSinceLastCapture = recordingTimeRef.current - lastCaptureTimeRef.current;
    const isSignificantChange = diff > currentThreshold;
    const maxFrames = MAX_FRAMES;

    if (!isFirstFrame) {
      // Enforce minimum time between captures
      if (timeSinceLastCapture < minInterval) {
        console.log(`Only ${timeSinceLastCapture.toFixed(1)}s since last capture, need ${minInterval}s, skipping`);
        return;
      }

      // Check if scene changed enough
      if (!isSignificantChange) {
        console.log(`Scene change ${diff.toFixed(3)} below threshold ${currentThreshold.toFixed(3)}, skipping`);
        return;
      }
      // Only skip blurry if we already have enough frames
      if (blurry && allFramesRef.current.length >= 5) {
        console.log('Frame too blurry and we have enough frames, skipping');
        return;
      }
      if (allFramesRef.current.length >= maxFrames) {
        console.log('Max frames reached, skipping');
        return;
      }
    }

    // Apply sharpening to enhance the frame (helps with action/motion blur)
    sharpenFrame(ctx, canvas.width, canvas.height);

    const frame = canvas.toDataURL('image/jpeg', 0.85); // Slightly higher quality after sharpening
    lastFrameRef.current = frame;
    const timestamp = recordingTimeRef.current;
    lastCaptureTimeRef.current = timestamp; // Track when we captured

    console.log(`Captured frame #${allFramesRef.current.length + 1} at ${timestamp}s (diff: ${diff.toFixed(3)}, minInterval: ${minInterval}s)`);

    // Store frame for later batch analysis
    allFramesRef.current.push({ timestamp, image: frame });

    // Add placeholder step to UI
    const stepId = `step-${Date.now()}`;
    const newStep: LiveStep = {
      id: stepId,
      timestamp: formatTime(timestamp),
      timestampSeconds: timestamp,
      thumbnail: frame,
      title: `Step ${allFramesRef.current.length}`,
      description: 'Capturing...',
      status: 'capturing'
    };

    setLiveSteps(prev => [...prev, newStep]);
  }, []);

  // Start audio recording fallback (for iOS Safari and browsers without Web Speech API)
  const startAudioRecordingFallback = async () => {
    try {
      // Get audio stream from existing video stream or request new one
      let audioStream: MediaStream;

      if (streamRef.current) {
        const audioTracks = streamRef.current.getAudioTracks();
        if (audioTracks.length > 0) {
          audioStream = new MediaStream(audioTracks);
        } else {
          // Request audio separately
          audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
      } else {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Find supported audio format
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/wav'
      ];

      let selectedMimeType = '';
      for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
          selectedMimeType = mimeType;
          break;
        }
      }

      if (!selectedMimeType) {
        console.warn('No supported audio format found for recording');
        return;
      }

      console.log('Starting audio fallback recording with:', selectedMimeType);

      audioChunksRef.current = [];
      const audioRecorder = new MediaRecorder(audioStream, { mimeType: selectedMimeType });

      audioRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      audioRecorder.onstop = () => {
        if (audioChunksRef.current.length > 0) {
          audioBlobRef.current = new Blob(audioChunksRef.current, { type: selectedMimeType });
          console.log('Audio recording saved:', audioBlobRef.current.size, 'bytes');
        }
        setAudioRecordingActive(false);
      };

      audioRecorder.start(1000); // Capture in 1s chunks
      audioRecorderRef.current = audioRecorder;
      setAudioRecordingActive(true);
      setHasAudioFallback(true);
      console.log('Audio fallback recording started');
    } catch (err) {
      console.error('Failed to start audio fallback:', err);
      setHasAudioFallback(false);
    }
  };

  // Stop audio recording fallback
  const stopAudioRecordingFallback = () => {
    return new Promise<void>((resolve) => {
      if (audioRecorderRef.current && audioRecorderRef.current.state !== 'inactive') {
        audioRecorderRef.current.onstop = () => {
          if (audioChunksRef.current.length > 0) {
            audioBlobRef.current = new Blob(audioChunksRef.current, { type: audioRecorderRef.current?.mimeType || 'audio/webm' });
            console.log('Audio recording saved:', audioBlobRef.current.size, 'bytes');
          }
          setAudioRecordingActive(false);
          resolve();
        };
        audioRecorderRef.current.stop();
        audioRecorderRef.current = null;
      } else {
        resolve();
      }
    });
  };

  // Start audio recording for Gemini transcription (works on ALL platforms)
  const startSpeechRecognition = async () => {
    console.log('Starting audio recording for Gemini transcription');
    setSpeechSupported(true); // Audio recording is supported
    setSpeechError(null);
    setIsListening(true); // Show that we're recording audio
    await startAudioRecordingFallback();
  };

  // Start recording
  const handleStartRecording = async () => {
    console.log("Record button clicked");
    if (!streamRef.current) {
        console.error("No stream reference");
        alert("Camera stream not found. Please refresh.");
        return;
    }

    try {
        // Reset state
        recordedChunksRef.current = [];
        allFramesRef.current = [];
        setLiveSteps([]);
        setRecordingTime(0);
        recordingTimeRef.current = 0;
        lastFrameRef.current = null;
        lastImageDataRef.current = null;
        transcriptRef.current = '';
        audioBlobRef.current = null;
        audioChunksRef.current = [];

        // Start speech recognition
        await startSpeechRecognition();

        // Start MediaRecorder
        const options = { mimeType: 'video/webm;codecs=vp9,opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            console.log("VP9 not supported, trying default webm");
            (options as any).mimeType = 'video/webm';
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
             console.log("WebM not supported, trying mp4");
            (options as any).mimeType = 'video/mp4';
        }

        console.log("Starting MediaRecorder with", options.mimeType);
        const mediaRecorder = new MediaRecorder(streamRef.current, options);
        
        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunksRef.current.push(e.data);
        };
        
        mediaRecorder.onerror = (e) => {
            console.error("MediaRecorder error:", e);
            alert("Recording error: " + (e as any).error?.message);
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(1000); // Capture in 1s chunks
        console.log("MediaRecorder started");

        // Start frame capture interval
        frameIntervalRef.current = setInterval(captureAndAnalyze, FRAME_INTERVAL_MS);

        // Capture first frame immediately
        setTimeout(captureAndAnalyze, 500);

        setIsRecording(true);
        if (!title) setTitle(`Live SOP ${new Date().toLocaleTimeString()}`);
    } catch (e: any) {
        console.error("Failed to start recording:", e);
        alert("Failed to start recording: " + e.message);
    }
  };

  // AI Director: Request feedback on current frame
  const requestDirectorFeedback = async (mode: 'on_demand' | 'proactive') => {
    if (!videoRef.current || !canvasRef.current || directorLoading) return;

    // Don't spam proactive checks
    if (mode === 'proactive') {
      const now = Date.now();
      if (now - lastProactiveCheckRef.current < PROACTIVE_CHECK_INTERVAL) return;
      lastProactiveCheckRef.current = now;
    }

    setDirectorLoading(true);
    try {
      // Capture current frame
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const frame = canvas.toDataURL('image/jpeg', 0.7);

      const response = await fetch('https://frameops-production.up.railway.app/director-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          frame,
          context: title || 'instructional video',
          currentStep: liveSteps.length > 0 ? `Step ${liveSteps.length + 1}` : 'Getting started',
          previousTips: previousTipsRef.current.slice(-3),
          mode
        })
      });

      const data = await response.json();

      if (data.success && data.needsFeedback && data.tip) {
        setDirectorTip(data.tip);
        setDirectorIssue(data.issue);
        setDirectorSeverity(data.severity);
        previousTipsRef.current.push(data.tip);

        // Auto-hide tip after 8 seconds
        setTimeout(() => {
          setDirectorTip(null);
          setDirectorIssue(null);
          setDirectorSeverity(null);
        }, 8000);
      } else if (mode === 'on_demand' && !data.needsFeedback) {
        // On demand but no issues - show positive feedback
        setDirectorTip('Ser bra ut! Fortsätt filma.');
        setDirectorSeverity('low');
        setTimeout(() => {
          setDirectorTip(null);
          setDirectorSeverity(null);
        }, 3000);
      }
    } catch (error) {
      console.error('Director feedback error:', error);
      if (mode === 'on_demand') {
        setDirectorTip('Kunde inte analysera bilden just nu');
        setDirectorSeverity('low');
        setTimeout(() => setDirectorTip(null), 3000);
      }
    } finally {
      setDirectorLoading(false);
    }
  };

  // Proactive director check during recording
  useEffect(() => {
    if (!isRecording || !directorMode || isPaused) return;

    const interval = setInterval(() => {
      requestDirectorFeedback('proactive');
    }, PROACTIVE_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [isRecording, directorMode, isPaused, title, liveSteps.length]);

  // Stop recording and finalize SOP
  const handleStopRecording = async () => {
    if (!isRecording) return;

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    setIsListening(false); // Stop showing listening indicator

    // Stop audio fallback recording
    console.log('Stopping audio recording...');
    await stopAudioRecordingFallback();
    console.log('Audio recording stopped. Blob size:', audioBlobRef.current?.size || 0);

    // Stop interval
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }

    setIsRecording(false);
    setIsFinishing(true);

    console.log('Stopping recording. Total frames captured:', allFramesRef.current.length);
    // Alert the user so they know how many frames are being processed
    alert(`Recording stopped. Captured ${allFramesRef.current.length} frames. Starting AI analysis...`);

    // Now batch analyze all frames with Gemini
    try {
      const frames = allFramesRef.current.map(f => f.image);
      const spokenContext = transcriptRef.current.trim();

      if (frames.length === 0) {
        alert('No frames captured. Please try again.');
        setIsFinishing(false);
        return;
      }

      // Check if we have audio fallback to process - transcribe with Gemini
      let audioTranscript = '';
      const hasAudioBlob = audioBlobRef.current && audioBlobRef.current.size > 0;
      console.log('Audio blob check:', {
        hasBlob: !!audioBlobRef.current,
        blobSize: audioBlobRef.current?.size || 0,
        hasSpokenContext: !!spokenContext,
        spokenContextLength: spokenContext?.length || 0
      });

      if (hasAudioBlob) {
        const blobSize = audioBlobRef.current?.size || 0;
        console.log('=== AUDIO TRANSCRIPTION START ===');
        console.log('Audio blob size:', blobSize, 'bytes (', (blobSize / 1024).toFixed(1), 'KB)');
        console.log('Audio blob type:', audioBlobRef.current?.type);

        if (blobSize < 5000) {
          console.warn('WARNING: Audio blob very small - may not contain speech');
        }

        try {
          audioTranscript = await transcribeAudioFile(audioBlobRef.current!);
          console.log('=== AUDIO TRANSCRIPTION RESULT ===');
          console.log('Transcript length:', audioTranscript?.length || 0, 'chars');
          console.log('Transcript content:', audioTranscript || '(EMPTY - no speech detected)');
          console.log('=================================');
        } catch (err) {
          console.error('Audio transcription FAILED:', err);
        }
      } else {
        console.warn('=== NO AUDIO BLOB - voice will not be used ===');
        console.warn('audioBlobRef.current:', audioBlobRef.current);
      }

      // Combine Web Speech API transcript with audio fallback transcript
      const finalTranscript = spokenContext || audioTranscript;
      console.log('Sending to Gemini with transcript:', finalTranscript);
      
      if (finalTranscript) {
        console.log(`Transcript found (${finalTranscript.length} chars). Using as primary source.`);
      } else {
        console.warn('No transcript found from either Web Speech or Audio Fallback');
        alert('No spoken instructions were captured. The AI will only use visual analysis.');
      }

      // Call Gemini to generate descriptions for all frames
      // Include spoken transcript as context
      const contextWithTranscript = finalTranscript
        ? `EXPERT TRANSCRIPT:\n"""\n${finalTranscript}\n"""\n\nINSTRUCTION: Convert this transcript into a formal step-by-step manual. Each step must be a direct command. Do not describe the video; write the manual for the person who will do the work.`
        : '';
      const result = await analyzeSOPFrames(frames, title, contextWithTranscript, []);
      console.log('Gemini returned steps:', result.steps.length);

      // Map Gemini results to our steps
      const finalSteps: SOPStep[] = result.steps.map((step, idx) => ({
        ...step,
        thumbnail: frames[idx] || frames[frames.length - 1],
        timestamp: allFramesRef.current[idx]?.timestamp
          ? formatTime(allFramesRef.current[idx].timestamp)
          : step.timestamp
      }));

      // Use Gemini-selected best thumbnail, fallback to ~33% into video
      const bestThumbnailIdx = typeof result.bestThumbnailIndex === 'number'
        ? result.bestThumbnailIndex
        : Math.floor(frames.length / 3);
      const thumbnailUrl = frames[bestThumbnailIdx] || frames[Math.floor(frames.length / 3)] || frames[0];
      console.log(`Using frame ${bestThumbnailIdx} as cover image (Gemini selected)`);

      // Create video blob from recorded chunks (will be uploaded to Supabase Storage)
      let videoBlob: Blob | undefined;
      if (recordedChunksRef.current.length > 0) {
        videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        console.log('Video blob created:', (videoBlob.size / 1024 / 1024).toFixed(2), 'MB');
      }

      // Create final SOP (videoBlob will be uploaded by App.tsx when saving)
      const sop: SOP = {
        id: Math.random().toString(36).substr(2, 9),
        title: result.title || title,
        description: result.description,
        ppeRequirements: result.ppeRequirements,
        materialsRequired: result.materialsRequired,
        createdAt: new Date().toISOString(),
        sourceType: 'live',
        status: 'completed',
        thumbnail_url: thumbnailUrl,
        steps: finalSteps,
        videoBlob: videoBlob // Pass blob for upload, not base64
      };

      onComplete(sop);
    } catch (err: any) {
      console.error('Error analyzing frames:', err);
      alert(`Error creating SOP: ${err.message}`);
    } finally {
      setIsFinishing(false);
    }
  };

  // Pause/resume recording
  const togglePause = () => {
    console.log('Toggling pause. Current state:', isPaused);
    if (isPaused) {
      mediaRecorderRef.current?.resume();
      frameIntervalRef.current = setInterval(captureAndAnalyze, FRAME_INTERVAL_MS);
    } else {
      mediaRecorderRef.current?.pause();
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    }
    setIsPaused(!isPaused);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleCancel = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
    }
    onCancel();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black">
      {/* Full screen video */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Top bar - minimal */}
      <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between safe-area-top z-20">
        <button
          onClick={handleCancel}
          className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
        >
          <i className="fas fa-times"></i>
        </button>

        {/* Title input - only show when recording */}
        {cameraStarted && (
          <div className="flex-1 mx-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Namnge din SOP..."
              className="w-full bg-black/40 backdrop-blur-sm text-white text-center font-medium px-4 py-2 rounded-full border-none outline-none placeholder:text-white/50"
            />
          </div>
        )}

        {/* Recording time */}
        {isRecording ? (
          <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-3 py-2 rounded-full">
            <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`}></div>
            <span className="text-white font-mono text-sm font-bold">{formatTime(recordingTime)}</span>
          </div>
        ) : cameraStarted ? (
          <button
            onClick={() => setShowSettings(true)}
            className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
          >
            <i className="fas fa-cog"></i>
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Start overlay - clean and minimal */}
      {!cameraStarted && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/90 to-black/95 flex flex-col items-center justify-center z-30 p-6">
          <div className="text-center max-w-sm">
            {!canCreate ? (
              <>
                {/* Upgrade prompt when limit reached */}
                <div className="w-28 h-28 bg-amber-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <i className="fas fa-crown text-amber-400 text-4xl"></i>
                </div>
                <h2 className="text-white text-2xl font-bold mb-2">You've used your 3 free SOPs</h2>
                <p className="text-slate-400 mb-8">Upgrade to Pro for unlimited SOPs.</p>
                <button
                  onClick={onUpgrade}
                  className="px-8 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-colors mb-4"
                >
                  <i className="fas fa-rocket mr-2"></i>
                  Upgrade to Pro
                </button>
                <button
                  onClick={onCancel}
                  className="block mx-auto text-slate-400 hover:text-white transition-colors"
                >
                  Go Back
                </button>
              </>
            ) : (
              <>
                <button
                  className="w-28 h-28 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 hover:bg-indigo-500 active:scale-95 transition-all shadow-2xl shadow-indigo-500/30"
                  onClick={(e) => {
                    e.preventDefault();
                    startCamera();
                  }}
                >
                  <i className="fas fa-video text-white text-4xl"></i>
                </button>
                <h2 className="text-white text-2xl font-bold mb-2">Start Camera</h2>
                <p className="text-slate-400 mb-4">Tap to start recording your SOP</p>

                {/* Free SOPs remaining */}
                {!isPro && (
                  <div className="mb-6">
                    <span className="px-3 py-1.5 bg-indigo-600/30 text-indigo-300 rounded-full text-xs font-bold">
                      <i className="fas fa-gift mr-1.5"></i>
                      {freeSOPsRemaining} free SOP{freeSOPsRemaining !== 1 ? 's' : ''} remaining
                    </span>
                  </div>
                )}

                {/* Quick settings preview */}
                <div className="flex items-center justify-center gap-4 text-sm">
                  <button
                    onClick={() => setShowSettings(true)}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                  >
                    <i className="fas fa-sliders-h"></i>
                    <span>Inställningar</span>
                  </button>
                  {directorMode && (
                    <span className="flex items-center gap-2 text-indigo-400">
                      <i className="fas fa-film"></i>
                      <span>AI Director på</span>
                    </span>
                  )}
                </div>

                {cameraError && (
                  <div className="mt-6 bg-red-600/20 border border-red-500/50 rounded-xl p-4">
                    <p className="text-red-400 text-sm">{cameraError}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Recording indicators - minimal */}
      {isRecording && (
        <>
          {/* Mic indicator - small icon only */}
          <div className="absolute top-20 left-4 z-20">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              isListening || audioRecordingActive ? 'bg-emerald-600' : 'bg-slate-700/80'
            }`}>
              <i className={`fas fa-microphone text-white text-xs ${isListening ? 'animate-pulse' : ''}`}></i>
            </div>
          </div>

          {/* Steps count - bottom right */}
          {liveSteps.length > 0 && (
            <button
              onClick={() => setShowStepsPanel(true)}
              className="absolute bottom-32 right-4 bg-black/60 backdrop-blur-sm text-white px-4 py-2 rounded-full flex items-center gap-2 z-20"
            >
              <i className="fas fa-layer-group text-indigo-400"></i>
              <span className="font-bold">{liveSteps.length}</span>
            </button>
          )}
        </>
      )}

      {/* AI Director feedback - only show when there's a tip */}
      {isRecording && directorMode && directorTip && (
        <div className="absolute top-20 left-4 right-4 md:right-auto md:max-w-sm z-20">
          <div className={`rounded-2xl p-4 backdrop-blur-md border ${
            directorSeverity === 'high'
              ? 'bg-red-900/90 border-red-500/50'
              : directorSeverity === 'medium'
              ? 'bg-amber-900/90 border-amber-500/50'
              : 'bg-emerald-900/90 border-emerald-500/50'
          }`}>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                directorSeverity === 'high' ? 'bg-red-500' :
                directorSeverity === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
              }`}>
                <i className={`fas ${
                  directorSeverity === 'high' ? 'fa-exclamation' :
                  directorSeverity === 'medium' ? 'fa-lightbulb' : 'fa-check'
                } text-white text-sm`}></i>
              </div>
              <div className="flex-1">
                <p className="text-white text-sm font-medium">{directorTip}</p>
              </div>
              <button
                onClick={() => setDirectorTip(null)}
                className="text-white/50 hover:text-white"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 safe-area-bottom z-20">
        <div className="flex items-center justify-center gap-6">
          {!isRecording ? (
            /* Start recording button */
            <button
              onClick={() => {
                if (!cameraStarted) return;
                handleStartRecording();
              }}
              disabled={!cameraStarted}
              className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center disabled:opacity-30"
            >
              <div className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 transition-colors"></div>
            </button>
          ) : (
            /* Recording controls */
            <>
              <button
                onClick={togglePause}
                className="w-14 h-14 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
              >
                <i className={`fas ${isPaused ? 'fa-play' : 'fa-pause'} text-lg`}></i>
              </button>

              <button
                onClick={handleStopRecording}
                disabled={isFinishing}
                className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-lg bg-white"></div>
              </button>

              {directorMode && (
                <button
                  onClick={() => requestDirectorFeedback('on_demand')}
                  disabled={directorLoading}
                  className="w-14 h-14 bg-indigo-600/80 backdrop-blur-sm rounded-full flex items-center justify-center text-white disabled:opacity-50"
                >
                  {directorLoading ? (
                    <i className="fas fa-circle-notch fa-spin"></i>
                  ) : (
                    <i className="fas fa-film"></i>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Finishing overlay */}
      {isFinishing && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-40">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white text-lg font-bold">Skapar SOP...</p>
            <p className="text-slate-400 text-sm mt-1">{allFramesRef.current.length} bilder analyseras</p>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSettings(false)} />
          <div className="relative bg-slate-900 w-full md:w-96 md:rounded-2xl p-6 space-y-6 rounded-t-3xl">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-lg font-bold">Inställningar</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Scene Sensitivity */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-white text-sm font-medium">Känslighet</label>
                <span className="text-indigo-400 text-sm font-bold">{sceneSensitivity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={sceneSensitivity}
                onChange={(e) => setSceneSensitivity(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
              <p className="text-slate-500 text-xs mt-2">
                {sceneSensitivity < 30 ? 'Färre bilder, bara stora förändringar' :
                 sceneSensitivity < 70 ? 'Balanserat' : 'Fler bilder, mer detaljer'}
              </p>
            </div>

            {/* AI Director */}
            <div className="flex items-center justify-between p-4 bg-slate-800 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center">
                  <i className="fas fa-film text-white"></i>
                </div>
                <div>
                  <p className="text-white font-medium">AI Director</p>
                  <p className="text-slate-400 text-xs">Tips medan du filmar</p>
                </div>
              </div>
              <button
                onClick={() => setDirectorMode(!directorMode)}
                className={`w-12 h-7 rounded-full transition-colors relative ${directorMode ? 'bg-indigo-500' : 'bg-slate-600'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-transform ${directorMode ? 'translate-x-6' : 'translate-x-1'}`}></div>
              </button>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-colors"
            >
              Klar
            </button>
          </div>
        </div>
      )}

      {/* Steps panel (mobile bottom sheet) */}
      {showStepsPanel && (
        <div className="absolute inset-0 z-50 flex flex-col">
          <div className="flex-1 bg-black/60" onClick={() => setShowStepsPanel(false)} />
          <div className="bg-slate-900 rounded-t-3xl max-h-[70vh] flex flex-col">
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 bg-slate-700 rounded-full"></div>
            </div>
            <div className="px-4 pb-3 flex items-center justify-between">
              <h3 className="text-white font-bold">
                Steg <span className="text-indigo-400">({liveSteps.length})</span>
              </h3>
              <button onClick={() => setShowStepsPanel(false)} className="text-slate-400">
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {liveSteps.map((step, idx) => (
                <div key={step.id} className="flex gap-3 bg-slate-800 rounded-xl p-2">
                  <img
                    src={step.thumbnail}
                    alt=""
                    className="w-20 h-14 object-cover rounded-lg"
                    onClick={() => { setShowStepsPanel(false); setPreviewImage(step.thumbnail); }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-500 text-xs font-mono">{step.timestamp}</p>
                    <p className="text-white text-sm font-medium truncate">{step.title || `Steg ${idx + 1}`}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Image preview */}
      {previewImage && (
        <div className="absolute inset-0 z-50 bg-black flex items-center justify-center" onClick={() => setPreviewImage(null)}>
          <button className="absolute top-4 right-4 text-white/60 hover:text-white z-10">
            <i className="fas fa-times text-2xl"></i>
          </button>
          <img src={previewImage} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
};

export default LiveSOPGenerator;
