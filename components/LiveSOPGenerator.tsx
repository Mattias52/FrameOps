import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SOP, SOPStep } from '../types';
import { analyzeSOPFrames, transcribeAudioFile } from '../services/geminiService';

// Deduplicate frames by comparing adjacent frames for similarity
// Returns indices of unique frames to keep
const deduplicateFrames = async (frames: string[], threshold: number = 0.02): Promise<number[]> => {
  if (frames.length <= 1) return frames.map((_, i) => i);

  const keepIndices: number[] = [0]; // Always keep first frame

  // Load frames into canvases for comparison
  const getPixelData = (base64: string): Promise<Uint8ClampedArray> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Use small size for fast comparison
        canvas.width = 64;
        canvas.height = 36;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, 64, 36);
        resolve(ctx.getImageData(0, 0, 64, 36).data);
      };
      img.onerror = () => resolve(new Uint8ClampedArray(64 * 36 * 4));
      img.src = base64;
    });
  };

  // Load all pixel data in parallel
  const pixelDataArr = await Promise.all(frames.map(f => getPixelData(f)));

  for (let i = 1; i < frames.length; i++) {
    const prev = pixelDataArr[keepIndices[keepIndices.length - 1]];
    const curr = pixelDataArr[i];
    let diff = 0;
    const len = prev.length;
    for (let j = 0; j < len; j += 4) {
      diff += Math.abs(prev[j] - curr[j]) + Math.abs(prev[j + 1] - curr[j + 1]) + Math.abs(prev[j + 2] - curr[j + 2]);
    }
    const normalizedDiff = diff / (len * 0.75 * 255);
    if (normalizedDiff > threshold) {
      keepIndices.push(i);
    }
  }

  return keepIndices;
};

interface LiveSOPGeneratorProps {
  onComplete: (sop: SOP) => void;
  onCancel: () => void;
  startWithScreenMode?: boolean;
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

interface ShotInstruction {
  step: number;
  instruction: string;
  filmingTip?: string;
  completed: boolean;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

const LiveSOPGenerator: React.FC<LiveSOPGeneratorProps> = ({
  onComplete,
  onCancel,
  startWithScreenMode = false,
  freeSOPsRemaining = 3,
  isPro = false,
  onUpgrade
}) => {
  const canCreate = isPro || freeSOPsRemaining > 0;

  // Phase state: setup -> recording -> review -> finishing
  const [phase, setPhase] = useState<'setup' | 'recording' | 'review' | 'finishing'>('setup');

  // Initial chat message
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([{
    role: 'ai',
    content: 'Hi! What will you be showing? Describe briefly and I\'ll help you plan the steps.'
  }]);

  // AI Guide state (chatMessages initialized above with welcome message)
  const [userInput, setUserInput] = useState('');
  const [proposedSteps, setProposedSteps] = useState<string[]>([]); // Steps being planned
  const [isReady, setIsReady] = useState(false); // AI thinks we're ready to record
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editingStepText, setEditingStepText] = useState('');
  const [currentRecordingStep, setCurrentRecordingStep] = useState(0); // Which step we're recording

  // Review phase state
  const [draftSOP, setDraftSOP] = useState<SOPStep[] | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [aiFeedback, setAiFeedback] = useState<string[]>([]); // AI suggestions for improvements
  const [reviewChatMessages, setReviewChatMessages] = useState<ChatMessage[]>([]);
  const [reviewInput, setReviewInput] = useState('');
  const [stepsToReRecord, setStepsToReRecord] = useState<number[]>([]); // Step indices to re-record
  const [isReRecording, setIsReRecording] = useState(false);
  const [reRecordStepIndex, setReRecordStepIndex] = useState<number | null>(null);
  const [isAnalyzingReview, setIsAnalyzingReview] = useState(false);

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

  // Language detection - based on user's chat input
  const [detectedLanguage, setDetectedLanguage] = useState<string>('en');

  // Fullscreen image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Camera permission state (iOS Safari requires user gesture to start camera)
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Recording mode: camera or screen
  const [recordingMode, setRecordingMode] = useState<'camera' | 'screen' | null>(
    startWithScreenMode ? 'screen' : null
  );

  // If starting with screen mode, skip to recording phase (user must click to start capture - getDisplayMedia requires user gesture)
  useEffect(() => {
    if (startWithScreenMode && phase === 'setup') {
      setRecordingMode('screen');
      setPhase('recording');
    }
  }, [startWithScreenMode]);

  // Scene detection settings (user-controllable)
  const [sceneSensitivity, setSceneSensitivity] = useState(50); // 0-100, 50 = balanced
  const [showSettings, setShowSettings] = useState(false);

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
  // Refs for stable access in callbacks (avoid stale closures)
  const recordingModeRef = useRef<'camera' | 'screen' | null>(recordingMode);
  const isRecordingRef = useRef(false);
  // Audio-only recorder for iOS Safari fallback (when Web Speech API unavailable)
  const audioRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);

  // Keep refs in sync with state for use in callbacks
  recordingModeRef.current = recordingMode;
  isRecordingRef.current = isRecording;

  // Scene detection settings - different for screen vs camera recording
  // Screen recording: capture more frequently, let Gemini find the click moments
  const isScreenMode = recordingMode === 'screen';
  const FRAME_INTERVAL_MS = isScreenMode ? 500 : 1000; // Screen: every 0.5s, Camera: every 1s
  // Convert sensitivity (0-100) to threshold: high sensitivity = low threshold
  // sensitivity 0 = threshold 0.20 (very few frames - only major changes)
  // sensitivity 50 = threshold 0.08 (balanced - captures more)
  // sensitivity 100 = threshold 0.02 (many frames - capture small changes)
  const SCENE_THRESHOLD = isScreenMode ? 0.08 : (0.20 - (sceneSensitivity / 100) * 0.18); // Screen: moderate threshold to avoid capturing tiny changes
  // Minimum seconds between captures (even if scene changes)
  // Screen: capture every 0.5s to catch all UI changes
  // Camera: sensitivity-based interval
  const MIN_CAPTURE_INTERVAL = isScreenMode ? 1.5 : Math.max(1.5, 8 - (sceneSensitivity / 100) * 6.5);
  const MAX_FRAMES = isScreenMode ? 120 : 60; // Screen recordings may need more frames

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

  // Start screen capture
  const startScreenCapture = async () => {
    setCameraError(null);

    // Check if getDisplayMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setCameraError('Screen recording is not supported in this browser.');
      return;
    }

    try {
      console.log('Requesting screen capture access...');

      // Get screen with audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true // Try to capture system audio
      });

      console.log('Screen capture access granted, tracks:', stream.getTracks().map(t => t.kind));

      // Check if we got audio - if not, try to add microphone
      const hasAudio = stream.getAudioTracks().length > 0;
      if (!hasAudio) {
        console.log('No system audio captured, adding microphone...');
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStream.getAudioTracks().forEach(track => stream.addTrack(track));
          console.log('Microphone added to stream');
        } catch (micErr) {
          console.log('Could not add microphone:', micErr);
        }
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((resolve) => {
          const timeoutId = setTimeout(() => resolve(), 2000);
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              clearTimeout(timeoutId);
              resolve();
            };
          } else {
            resolve();
          }
        });
      }

      // Listen for when user stops sharing via browser UI
      stream.getVideoTracks()[0].onended = () => {
        console.log('User stopped screen sharing via browser UI');
        if (isRecordingRef.current) {
          handleStopRecording();
        }
      };

      setCameraStarted(true);
      console.log('Screen capture started successfully');
    } catch (err: any) {
      console.error("Screen capture error:", err);

      let errorMessage = `${err.name || 'Error'}: ${err.message}`;

      if (err.name === 'NotAllowedError') {
        errorMessage = 'Screen sharing was cancelled or denied.';
      } else if (err.name === 'NotFoundError') {
        errorMessage = 'No screen available for capture.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage = 'Screen recording is not supported in this browser.';
      }

      setCameraError(errorMessage);
    }
  };

  // Start capture based on recording mode
  const startCapture = async () => {
    if (recordingMode === 'screen') {
      await startScreenCapture();
    } else {
      await startCamera();
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
    // Skip blur detection for screen recordings (screen content like white backgrounds scores as "blurry")
    const blurry = recordingModeRef.current === 'screen' ? false : isFrameBlurry(imageData);
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
        return;
      }

      // For screen recordings: force capture every 5s even without scene change
      // This ensures we don't miss pages where the UI looks similar
      const isScreen = recordingModeRef.current === 'screen';
      const forceCapture = isScreen && timeSinceLastCapture >= 15;

      // Check if scene changed enough (skip if force capture)
      if (!isSignificantChange && !forceCapture) {
        return;
      }
      if (forceCapture && !isSignificantChange) {
        console.log(`Force capture at ${recordingTimeRef.current.toFixed(1)}s (${timeSinceLastCapture.toFixed(1)}s since last)`);
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
    allFramesRef.current.push({
      timestamp,
      image: frame
    });

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

  // Simple language detection based on common words
  const detectLanguage = (text: string): string => {
    const lower = text.toLowerCase();
    // Swedish indicators
    const swedishWords = ['jag', 'ska', 'hur', 'man', 'och', 'att', 'det', 'en', 'på', 'för', 'med', 'som', 'är', 'av', 'till', 'den', 'har', 'vi', 'kan', 'om', 'så', 'eller', 'när', 'från', 'vara', 'vill', 'göra', 'visa', 'börja', 'sedan', 'efter', 'före', 'steg', 'första', 'nästa'];
    const swedishCount = swedishWords.filter(w => lower.includes(w)).length;

    // If multiple Swedish words detected, it's Swedish
    if (swedishCount >= 2) return 'sv';
    // Check for Swedish characters
    if (/[åäö]/i.test(text)) return 'sv';

    return 'en';
  };

  // Handle chat message in setup phase - always use structured response
  const handleSetupChat = async (message: string) => {
    if (!message.trim()) return;

    setUserInput(''); // Clear input immediately
    setIsGeneratingGuide(true);
    setChatMessages(prev => [...prev, { role: 'user', content: message }]);

    // Detect language from user's message
    const lang = detectLanguage(message);
    if (detectedLanguage !== lang) {
      setDetectedLanguage(lang);
      console.log('Detected language:', lang);
    }

    // Set title from first message if not set
    if (!title) {
      setTitle(message.slice(0, 50));
    }

    try {
      const response = await fetch('https://frameops-production.up.railway.app/review-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          phase: 'setup',
          steps: proposedSteps.map(s => ({ title: s, description: s })),
          previousMessages: chatMessages.slice(-6),
          language: lang // Pass detected language to backend
        })
      });

      const data = await response.json();

      if (data.success) {
        // Update chat
        setChatMessages(prev => [...prev, { role: 'ai', content: data.response }]);

        // Update steps if provided
        if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
          setProposedSteps(data.steps);
        }

        // Update ready state
        if (data.ready !== undefined) {
          setIsReady(data.ready);
        }
      } else {
        setChatMessages(prev => [...prev, {
          role: 'ai',
          content: 'Describe what you\'ll show and I\'ll help create the steps!'
        }]);
      }
    } catch (error) {
      console.error('Error in setup chat:', error);
      setChatMessages(prev => [...prev, {
        role: 'ai',
        content: 'Något gick fel. Försök igen!'
      }]);
    } finally {
      setIsGeneratingGuide(false);
    }
  };

  // Edit a step directly
  const handleStepEdit = (index: number) => {
    setEditingStepIndex(index);
    setEditingStepText(proposedSteps[index]);
  };

  const saveStepEdit = () => {
    if (editingStepIndex !== null && editingStepText.trim()) {
      setProposedSteps(prev => prev.map((s, i) => i === editingStepIndex ? editingStepText.trim() : s));
    }
    setEditingStepIndex(null);
    setEditingStepText('');
  };

  const deleteStep = (index: number) => {
    setProposedSteps(prev => prev.filter((_, i) => i !== index));
  };

  const addStep = () => {
    setProposedSteps(prev => [...prev, 'New step...']);
    setEditingStepIndex(proposedSteps.length);
    setEditingStepText('');
  };


  // Skip AI guide and go directly to recording
  const skipToRecording = () => {
    setPhase('recording');
  };

  // Stop recording and go to review phase
  const handleStopRecording = async () => {
    if (!isRecording) return;

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }
    setIsListening(false);

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
    setIsAnalyzingReview(true);

    console.log('Stopping recording. Total frames captured:', allFramesRef.current.length);

    // Generate draft SOP for review
    try {
      const allCapturedFrames = allFramesRef.current.map(f => f.image);
      const spokenContext = transcriptRef.current.trim();

      if (allCapturedFrames.length === 0) {
        alert('No frames captured. Please try again.');
        setIsAnalyzingReview(false);
        setPhase('setup');
        return;
      }

      // For screen recordings: deduplicate frames to get only distinct screens
      let frames: string[];
      let originalFrames: string[]; // Clean frames for thumbnails
      if (recordingMode === 'screen') {
        console.log(`Deduplicating ${allCapturedFrames.length} frames...`);
        const uniqueIndices = await deduplicateFrames(allCapturedFrames, 0.15);
        frames = uniqueIndices.map(i => allCapturedFrames[i]);
        originalFrames = frames;
        // Update allFramesRef to match deduplicated set
        const dedupedFrameData = uniqueIndices.map(i => allFramesRef.current[i]);
        allFramesRef.current = dedupedFrameData;
        console.log(`Deduplicated to ${frames.length} unique frames (from ${allCapturedFrames.length})`);
        // Hard cap at 10 frames for screen recordings
        if (frames.length > 10) {
          console.log(`Capping ${frames.length} frames to 10`);
          frames = frames.slice(0, 10);
          originalFrames = originalFrames.slice(0, 10);
          allFramesRef.current = allFramesRef.current.slice(0, 10);
        }
      } else {
        frames = allCapturedFrames;
        originalFrames = allCapturedFrames;
      }

      // Transcribe audio
      let audioTranscript = '';
      const hasAudioBlob = audioBlobRef.current && audioBlobRef.current.size > 0;

      if (hasAudioBlob) {
        console.log('Transcribing audio...');
        try {
          audioTranscript = await transcribeAudioFile(audioBlobRef.current!);
          console.log('Transcript:', audioTranscript?.substring(0, 100) || '(empty)');
        } catch (err) {
          console.error('Audio transcription failed:', err);
        }
      }

      const finalTranscript = spokenContext || audioTranscript;

      // Create context - VISUAL CONTENT IS PRIMARY, transcript secondary
      let contextWithTranscript = '';

      // Language instruction based on detected language
      const languageInstruction = detectedLanguage === 'sv'
        ? 'LANGUAGE: Respond in Swedish (Svenska). All step titles and descriptions must be in Swedish.'
        : 'LANGUAGE: Respond in English. All step titles and descriptions must be in English.';

      // Special instructions for screen recordings - 1 step per frame, sequential
      const screenRecordingInstructions = recordingMode === 'screen' ? `
SCREEN RECORDING MODE - ONE STEP PER FRAME:
This is a screen recording. You are receiving ${frames.length} pre-deduplicated frames. Each frame shows a DIFFERENT screen/page.

CRITICAL RULES:
- Create EXACTLY ${frames.length} steps - one for each frame, in order
- Step 1 describes what you see in Frame 1 (first image)
- Step 2 describes what you see in Frame 2 (second image)
- Step N describes what you see in Frame N
- The frameIndex for step 1 MUST be 0, step 2 MUST be 1, step 3 MUST be 2, etc.
- Do NOT reorder or skip frames
- Do NOT create more or fewer steps than frames

FOR EACH STEP:
- Describe what is shown on the screen in that specific frame
- If voice narration exists, use the user's words to enhance the description
- Use clear, actionable language ("Navigate to...", "Click on...", "View the...")

` : '';

      // CRITICAL: Force AI to analyze actual visual content
      const visualValidationPrefix = `${languageInstruction}
${screenRecordingInstructions}
CRITICAL INSTRUCTION: You MUST analyze the actual visual content of these ${frames.length} video frames.
DO NOT generate steps based on the title alone.
DESCRIBE WHAT YOU ACTUALLY SEE in the images - if you see a computer screen, code, text chat, or something unrelated to "${title}", you must say so.
If the frames show something completely different from the title (e.g., title says "brush teeth" but frames show a computer screen), respond with steps describing what is ACTUALLY visible, and include a WARNING that the content doesn't match the title.

`;

      // Include planned steps for validation
      const plannedStepsContext = proposedSteps.length > 0
        ? `\n\nUSER PLANNED STEPS: ${proposedSteps.join(', ')}\nWARNING: If the video content does NOT show these activities, you MUST note this in your response. Do NOT make up steps that aren't visible in the frames.`
        : '';

      if (finalTranscript) {
        contextWithTranscript = `${visualValidationPrefix}VIDEO TRANSCRIPT:\n"${finalTranscript}"\n\nUse the transcript to inform step descriptions, but verify that the visual content matches.${plannedStepsContext}`;
      } else {
        contextWithTranscript = `${visualValidationPrefix}No audio transcript available. Base your analysis ENTIRELY on what you see in the video frames.${plannedStepsContext}`;
      }

      const result = await analyzeSOPFrames(frames, title, contextWithTranscript, [], []);
      console.log('Gemini returned steps:', result.steps.length);

      const numFrames = frames.length;
      let draftSteps: SOPStep[];

      if (recordingMode === 'screen') {
        // SCREEN RECORDING: Sequential assignment - ignore Gemini's frameIndex entirely
        // Trim or pad steps to match frame count
        const stepsToUse = result.steps.slice(0, numFrames);
        console.log(`Screen recording: mapping ${stepsToUse.length} steps to ${numFrames} frames sequentially`);

        draftSteps = stepsToUse.map((step, idx) => {
          console.log(`Step ${idx + 1}: "${step.title}" → Frame ${idx + 1}/${numFrames}`);
          return {
            ...step,
            thumbnail: originalFrames[idx],
            timestamp: allFramesRef.current[idx]?.timestamp
              ? formatTime(allFramesRef.current[idx].timestamp)
              : step.timestamp
          };
        });
      } else {
        // NON-SCREEN: Use Gemini's frameIndex with unique assignment
        const numSteps = result.steps.length;
        const usedFrames = new Set<number>();

        draftSteps = result.steps.map((step, idx) => {
          let frameIndex: number;
          if (typeof step.frameIndex === 'number' && step.frameIndex >= 0 && step.frameIndex < numFrames && !usedFrames.has(step.frameIndex)) {
            frameIndex = step.frameIndex;
            console.log(`Step ${idx + 1}/${numSteps}: Gemini selected frame ${frameIndex + 1}/${numFrames}`);
          } else {
            frameIndex = 0;
            for (let i = 0; i < numFrames; i++) {
              if (!usedFrames.has(i)) { frameIndex = i; break; }
            }
            console.log(`Step ${idx + 1}/${numSteps}: assigned unused frame ${frameIndex + 1}/${numFrames}`);
          }
          usedFrames.add(frameIndex);
          return {
            ...step,
            thumbnail: originalFrames[frameIndex],
            timestamp: allFramesRef.current[frameIndex]?.timestamp
              ? formatTime(allFramesRef.current[frameIndex].timestamp)
              : step.timestamp
          };
        });
      }

      setDraftSOP(draftSteps);
      setDraftTitle(result.title || title);
      setDraftDescription(result.description || '');

      // Get AI feedback on the draft
      const feedback = await getAIFeedbackOnDraft(draftSteps, finalTranscript);
      setAiFeedback(feedback);

      // Initialize review chat
      setReviewChatMessages([{
        role: 'ai',
        content: feedback.length > 0
          ? `Here's your SOP with ${draftSteps.length} steps. I have some suggestions:\n\n${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nWant to re-record any step, or are you satisfied?`
          : `Great job! Here's your SOP with ${draftSteps.length} steps. Does it look good, or would you like to change something?`
      }]);

      setPhase('review');

      // Stop camera when entering review phase
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setCameraStarted(false);
    } catch (err: any) {
      console.error('Error creating draft SOP:', err);
      alert(`Fel vid analys: ${err.message}`);
      setPhase('setup');
    } finally {
      setIsAnalyzingReview(false);
    }
  };

  // Get AI feedback on draft SOP - compare with planned steps
  const getAIFeedbackOnDraft = async (steps: SOPStep[], transcript: string): Promise<string[]> => {
    try {
      const response = await fetch('https://frameops-production.up.railway.app/review-sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: steps.map(s => ({ title: s.title, description: s.description })),
          plannedSteps: proposedSteps, // Include what was planned
          transcript,
          frameCount: allFramesRef.current.length
        })
      });

      const data = await response.json();
      if (data.success && data.feedback) {
        return data.feedback;
      }
    } catch (error) {
      console.error('Error getting AI feedback:', error);
    }

    // Local validation if API fails - check if recorded matches planned
    if (proposedSteps.length > 0 && steps.length > 0) {
      const recordedTitles = steps.map(s => s.title.toLowerCase());
      const plannedTitles = proposedSteps.map(s => s.toLowerCase());

      // Simple check: do any recorded steps mention keywords from planned steps?
      const hasMatch = plannedTitles.some(planned =>
        recordedTitles.some(recorded =>
          planned.split(' ').some(word => word.length > 3 && recorded.includes(word))
        )
      );

      if (!hasMatch) {
        return [`⚠️ Warning: The recording doesn't seem to match your plan. You planned to show "${proposedSteps[0]}" but I detected different content. Consider re-recording.`];
      }
    }
    return [];
  };

  // Finalize and complete SOP
  const finalizeSOP = async () => {
    if (!draftSOP) return;

    setIsFinishing(true);
    setPhase('finishing');

    try {
      const frames = allFramesRef.current.map(f => f.image);

      // Use Gemini-selected best thumbnail or ~33% into video
      const bestThumbnailIdx = Math.floor(frames.length / 3);
      const thumbnailUrl = frames[bestThumbnailIdx] || frames[0];

      // Create video blob
      let videoBlob: Blob | undefined;
      if (recordedChunksRef.current.length > 0) {
        videoBlob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        console.log('Video blob created:', (videoBlob.size / 1024 / 1024).toFixed(2), 'MB');
      }

      // Convert frames for frame picker
      const allFramesForPicker = allFramesRef.current.map(f => ({
        timestamp: formatTime(f.timestamp),
        imageBase64: f.image
      }));

      const sop: SOP = {
        id: Math.random().toString(36).substr(2, 9),
        title: draftTitle || title,
        description: draftDescription,
        ppeRequirements: [],
        materialsRequired: [],
        createdAt: new Date().toISOString(),
        sourceType: 'live',
        status: 'completed',
        thumbnail_url: thumbnailUrl,
        steps: draftSOP,
        allFrames: allFramesForPicker,
        videoBlob: videoBlob
      };

      onComplete(sop);
    } catch (err: any) {
      console.error('Error finalizing SOP:', err);
      alert(`Fel: ${err.message}`);
      setIsFinishing(false);
      setPhase('review');
    }
  };

  // Handle review chat - discuss improvements
  const handleReviewChat = async (message: string) => {
    if (!message.trim()) return;

    setReviewChatMessages(prev => [...prev, { role: 'user', content: message }]);
    setReviewInput('');

    // Check if user wants to re-record a step
    const reRecordMatch = message.match(/step\s*(\d+)/i) || message.match(/(\d+)/);
    if (reRecordMatch && (message.toLowerCase().includes('redo') || message.toLowerCase().includes('again') || message.toLowerCase().includes('show') || message.toLowerCase().includes('record'))) {
      const stepNum = parseInt(reRecordMatch[1]);
      if (stepNum > 0 && stepNum <= (draftSOP?.length || 0)) {
        setReviewChatMessages(prev => [...prev, {
          role: 'ai',
          content: `Ok, I'm marking step ${stepNum} for re-recording. Click "Re-record marked steps" when you're ready.`
        }]);
        setStepsToReRecord(prev => prev.includes(stepNum - 1) ? prev : [...prev, stepNum - 1]);
        return;
      }
    }

    // Check for approval
    if (message.toLowerCase().includes('good') || message.toLowerCase().includes('great') || message.toLowerCase().includes('ok') || message.toLowerCase().includes('satisfied') || message.toLowerCase().includes('done')) {
      // Warn if too few steps - likely incomplete recording
      if (draftSOP && draftSOP.length <= 2) {
        setReviewChatMessages(prev => [...prev, {
          role: 'ai',
          content: `Hmm, your SOP only has ${draftSOP.length} steps - that seems short. Is something missing? You can:\n\n1. Record again with more steps\n2. Add steps manually\n3. If it's really complete, click "Finalize"`
        }]);
        return;
      }
      setReviewChatMessages(prev => [...prev, {
        role: 'ai',
        content: 'Perfect! Click "Finalize SOP" to save.'
      }]);
      return;
    }

    // Otherwise, send to AI for general discussion
    try {
      const response = await fetch('https://frameops-production.up.railway.app/review-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          steps: draftSOP?.map(s => ({ title: s.title, description: s.description })),
          previousMessages: reviewChatMessages.slice(-4)
        })
      });

      const data = await response.json();
      if (data.success && data.response) {
        setReviewChatMessages(prev => [...prev, { role: 'ai', content: data.response }]);
      }
    } catch (error) {
      console.error('Error in review chat:', error);
      setReviewChatMessages(prev => [...prev, {
        role: 'ai',
        content: 'I didn\'t quite understand. Want to re-record a step? Say e.g. "redo step 3".'
      }]);
    }
  };

  // Start re-recording specific steps
  const startReRecording = async () => {
    if (stepsToReRecord.length === 0) return;

    setReRecordStepIndex(stepsToReRecord[0]);
    setIsReRecording(true);

    // Reset recording state for re-record
    recordedChunksRef.current = [];
    allFramesRef.current = [];
    setRecordingTime(0);
    recordingTimeRef.current = 0;
    lastCaptureTimeRef.current = 0;
    lastImageDataRef.current = null;

    // Start capture if not running (respect recording mode)
    if (!streamRef.current) {
      if (recordingMode === 'screen') {
        await startScreenCapture();
      } else {
        await startCamera();
      }
    }

    // Start recording
    await handleStartRecording();
  };

  // Handle re-record completion
  const handleReRecordComplete = async () => {
    if (reRecordStepIndex === null || !draftSOP) return;

    setIsRecording(false);

    // Stop audio
    await stopAudioRecordingFallback();

    // Stop interval
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }

    // Get new frames captured during re-record
    const newFrames = allFramesRef.current.slice(-5); // Take last 5 frames from re-record

    if (newFrames.length > 0) {
      // Update the step's thumbnail with new frame
      const updatedSteps = [...draftSOP];
      updatedSteps[reRecordStepIndex] = {
        ...updatedSteps[reRecordStepIndex],
        thumbnail: newFrames[Math.floor(newFrames.length / 2)].image
      };
      setDraftSOP(updatedSteps);
    }

    // Remove this step from re-record list
    const remaining = stepsToReRecord.filter(i => i !== reRecordStepIndex);
    setStepsToReRecord(remaining);

    if (remaining.length > 0) {
      // More steps to re-record
      setReRecordStepIndex(remaining[0]);
      setReviewChatMessages(prev => [...prev, {
        role: 'ai',
        content: `Step ${reRecordStepIndex + 1} updated! Now it's step ${remaining[0] + 1}: "${draftSOP[remaining[0]]?.title}"`
      }]);
    } else {
      // Done re-recording - stop camera
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      setCameraStarted(false);

      setIsReRecording(false);
      setReRecordStepIndex(null);
      setReviewChatMessages(prev => [...prev, {
        role: 'ai',
        content: 'All steps updated! Does it look better now?'
      }]);
    }
  };

  // Pause/resume recording
  const togglePause = () => {
    console.log('Toggling pause. Current state:', isPaused);
    if (isPaused) {
      // Resuming
      mediaRecorderRef.current?.resume();
      frameIntervalRef.current = setInterval(captureAndAnalyze, FRAME_INTERVAL_MS);
    } else {
      // Pausing
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
    <div className="fixed inset-0 z-50 bg-black overflow-hidden" style={{ width: '100vw', height: '100dvh' }}>
      {/* Full screen video - use dvh for mobile viewport */}
      {/* For screen recording, hide video to avoid infinite mirror effect */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 w-full h-full object-cover ${recordingMode === 'screen' && cameraStarted ? 'opacity-0 pointer-events-none' : ''}`}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Screen recording mode UI - show when screen capture is active */}
      {recordingMode === 'screen' && cameraStarted && (
        <>
          {/* Before recording: Full screen start UI */}
          {!isRecording && (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 flex items-center justify-center z-40">
              <div className="text-center max-w-lg px-6">
                <div className="w-32 h-32 rounded-full bg-indigo-500/20 flex items-center justify-center mx-auto mb-6">
                  <div className="w-24 h-24 rounded-full bg-indigo-500/30 flex items-center justify-center">
                    <i className="fas fa-desktop text-indigo-400 text-4xl"></i>
                  </div>
                </div>
                <p className="text-white text-2xl font-bold mb-2">Screen Ready</p>
                <p className="text-slate-400 mb-8">Press to start recording</p>

                <button
                  onClick={handleStartRecording}
                  className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 hover:bg-white/20 transition-colors"
                >
                  <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 transition-colors"></div>
                </button>
              </div>
            </div>
          )}

          {/* During recording: Small floating control bar */}
          {isRecording && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-40">
              <div className="bg-black/80 backdrop-blur-sm rounded-2xl px-6 py-4 flex items-center gap-4 shadow-2xl">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-red-400 font-mono font-bold text-lg">{formatTime(recordingTime)}</span>
                </div>
                <button
                  onClick={togglePause}
                  className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center text-white transition-colors"
                >
                  <i className={`fas ${isPaused ? 'fa-play' : 'fa-pause'}`}></i>
                </button>
                <button
                  onClick={handleStopRecording}
                  className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-colors"
                >
                  <i className="fas fa-stop mr-2"></i>
                  Stop
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Top bar - minimal (hide during split-screen recording - steps panel has time) */}
      {!(proposedSteps.length > 0 && cameraStarted && isRecording) && (
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between safe-area-top z-20">
          <button
            onClick={handleCancel}
            className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
            aria-label="Cancel"
          >
            <i className="fas fa-times"></i>
          </button>

          {/* Title input - only show when camera is on but not split-screen recording */}
          {cameraStarted && proposedSteps.length === 0 && (
            <div className="flex-1 mx-4">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Name your SOP..."
                className="w-full bg-black/40 backdrop-blur-sm text-white text-center font-medium px-4 py-2 rounded-full border-none outline-none placeholder:text-white/50"
              />
            </div>
          )}

          {/* Recording time - only without split-screen */}
          {isRecording && proposedSteps.length === 0 ? (
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-sm px-3 py-2 rounded-full">
              <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`}></div>
              <span className="text-white font-mono text-sm font-bold">{formatTime(recordingTime)}</span>
            </div>
          ) : cameraStarted && proposedSteps.length === 0 ? (
            <button
              onClick={() => setShowSettings(true)}
              className="w-10 h-10 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
              aria-label="Settings"
            >
              <i className="fas fa-cog"></i>
            </button>
          ) : <div className="w-10" />}
        </div>
      )}

      {/* Setup phase - SPLIT VIEW: Steps + Chat */}
      {phase === 'setup' && !cameraStarted && (
        <div className="absolute inset-0 bg-slate-900 flex flex-col z-30">
          {/* Header */}
          <div className="p-3 md:p-4 flex items-center justify-between border-b border-slate-800 safe-area-top">
            <button onClick={handleCancel} className="text-slate-400 hover:text-white p-1">
              <i className="fas fa-times text-lg md:text-xl"></i>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 md:w-8 md:h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                <i className="fas fa-video text-white text-xs md:text-sm"></i>
              </div>
              <span className="text-white font-bold text-sm md:text-base">Plan Recording</span>
            </div>
            <div className="w-8"></div>
          </div>

          {/* Split view: On mobile, show chat first (more important), steps below */}
          <div className="flex-1 flex flex-col-reverse md:flex-row overflow-hidden">
            {/* Left: Steps panel (bottom on mobile) */}
            <div className={`md:w-1/2 flex flex-col border-t md:border-t-0 md:border-r border-slate-800 bg-slate-900/50 ${
              proposedSteps.length === 0 ? 'hidden md:flex' : 'max-h-[40vh] md:max-h-none'
            }`}>
              <div className="p-3 md:p-4 border-b border-slate-800">
                <h3 className="text-white font-bold flex items-center gap-2 text-sm md:text-base">
                  <i className="fas fa-list-check text-indigo-400"></i>
                  <span className="hidden md:inline">Steps to Record</span>
                  <span className="md:hidden">Steps</span>
                  {proposedSteps.length > 0 && (
                    <span className="text-slate-400 font-normal text-xs md:text-sm">({proposedSteps.length})</span>
                  )}
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2">
                {proposedSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-800/50 rounded-xl p-2.5 md:p-3 border border-slate-700 group"
                  >
                    {editingStepIndex === idx ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editingStepText}
                          onChange={(e) => setEditingStepText(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && saveStepEdit()}
                          className="flex-1 bg-slate-700 text-white px-3 py-2 rounded-lg text-sm outline-none"
                          autoFocus
                        />
                        <button
                          onClick={saveStepEdit}
                          className="px-3 py-2 bg-emerald-600 text-white rounded-lg"
                        >
                          <i className="fas fa-check"></i>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 md:gap-3">
                        <div className="w-6 h-6 md:w-7 md:h-7 bg-indigo-600/30 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-indigo-300 text-xs md:text-sm font-bold">{idx + 1}</span>
                        </div>
                        <p className="text-white text-xs md:text-sm flex-1 pt-0.5 md:pt-1">{step}</p>
                        <div className="flex gap-1 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleStepEdit(idx)}
                            className="w-6 h-6 md:w-7 md:h-7 bg-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
                          >
                            <i className="fas fa-pen text-[10px] md:text-xs"></i>
                          </button>
                          <button
                            onClick={() => deleteStep(idx)}
                            className="w-6 h-6 md:w-7 md:h-7 bg-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400"
                          >
                            <i className="fas fa-trash text-[10px] md:text-xs"></i>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* Add step button */}
                {proposedSteps.length > 0 && (
                  <button
                    onClick={addStep}
                    className="w-full py-1.5 md:py-2 border-2 border-dashed border-slate-700 rounded-xl text-slate-500 hover:border-slate-600 hover:text-slate-400 transition-colors text-xs md:text-sm"
                  >
                    <i className="fas fa-plus mr-1 md:mr-2"></i>
                    Add
                  </button>
                )}
              </div>

              {/* Start recording button */}
              <div className="p-3 md:p-4 border-t border-slate-800 space-y-2">
                <button
                  onClick={skipToRecording}
                  disabled={proposedSteps.length === 0}
                  className={`w-full py-3 md:py-4 font-bold text-base md:text-lg rounded-xl transition-colors ${
                    proposedSteps.length > 0
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <i className="fas fa-video mr-2"></i>
                  {proposedSteps.length > 0 ? 'Start Recording' : 'Create steps first...'}
                </button>
                {proposedSteps.length === 0 && (
                  <button
                    onClick={skipToRecording}
                    className="w-full py-2 text-slate-400 hover:text-white text-sm transition-colors"
                  >
                    or just record without a plan →
                  </button>
                )}
              </div>
            </div>

            {/* Right: Chat panel (top on mobile - primary UI) */}
            <div className="md:w-1/2 flex flex-col flex-1 md:flex-initial">
              <div className="p-3 md:p-4 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-white font-bold flex items-center gap-2 text-sm md:text-base">
                  <i className="fas fa-comments text-indigo-400"></i>
                  AI Assistant
                </h3>
                {/* Mobile: Skip to free recording */}
                {proposedSteps.length === 0 && (
                  <button
                    onClick={skipToRecording}
                    className="text-slate-400 text-xs md:hidden"
                  >
                    Skip <i className="fas fa-arrow-right ml-1"></i>
                  </button>
                )}
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-2 md:space-y-3">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] md:max-w-[85%] p-2.5 md:p-3 rounded-xl text-xs md:text-sm whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-100'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {isGeneratingGuide && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 text-slate-100 p-2.5 md:p-3 rounded-xl text-xs md:text-sm">
                      <i className="fas fa-circle-notch fa-spin mr-2"></i>
                      Thinking...
                    </div>
                  </div>
                )}
                <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
              </div>

              {/* Chat input */}
              <div className="p-3 md:p-4 border-t border-slate-800 safe-area-bottom">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && userInput.trim() && handleSetupChat(userInput.trim())}
                    placeholder="What will you show?"
                    className="flex-1 bg-slate-800 text-white px-3 md:px-4 py-2.5 md:py-3 rounded-xl border border-slate-700 focus:border-indigo-500 outline-none text-sm"
                    disabled={isGeneratingGuide}
                  />
                  <button
                    onClick={() => userInput.trim() && handleSetupChat(userInput.trim())}
                    disabled={!userInput.trim() || isGeneratingGuide}
                    className="px-4 md:px-5 py-2.5 md:py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <i className="fas fa-paper-plane"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recording phase - choose recording mode and start */}
      {phase === 'recording' && !cameraStarted && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-black flex items-center justify-center z-30">
          <div className="text-center max-w-md px-4">
            {!recordingMode ? (
              <>
                <h3 className="text-white text-xl font-bold mb-6">How do you want to record?</h3>
                <div className="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    onClick={() => {
                      setRecordingMode('camera');
                      startCamera();
                    }}
                    className="px-6 py-4 bg-indigo-600 text-white font-bold rounded-2xl hover:bg-indigo-500 transition-colors"
                  >
                    <i className="fas fa-video mr-3"></i>
                    Camera
                    <p className="text-indigo-200 text-sm font-normal mt-1">Film yourself or your work</p>
                  </button>
                  <button
                    onClick={() => {
                      setRecordingMode('screen');
                      startScreenCapture();
                    }}
                    className="px-6 py-4 bg-slate-700 text-white font-bold rounded-2xl hover:bg-slate-600 transition-colors"
                  >
                    <i className="fas fa-desktop mr-3"></i>
                    Screen
                    <p className="text-slate-300 text-sm font-normal mt-1">Record your screen</p>
                  </button>
                </div>
              </>
            ) : (
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-white">Starting {recordingMode === 'screen' ? 'screen capture' : 'camera'}...</p>
              </div>
            )}
            {cameraError && (
              <div className="mt-4 bg-red-600/20 border border-red-500/50 rounded-xl p-4">
                <p className="text-red-400 text-sm">{cameraError}</p>
                <button
                  onClick={() => {
                    setCameraError(null);
                    setRecordingMode(null);
                  }}
                  className="mt-3 text-slate-400 hover:text-white text-sm"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SPLIT-SCREEN Recording view - Steps left, Camera right (NOT for screen recording mode) */}
      {(phase === 'setup' || phase === 'recording') && cameraStarted && recordingMode !== 'screen' && (
        <div className="absolute inset-0 flex z-25">
          {/* Left: Steps panel (only if we have steps) - HIDDEN on mobile, shown as overlay */}
          {proposedSteps.length > 0 && !isMobile && (
            <div className="w-80 bg-slate-900/95 backdrop-blur-sm flex flex-col border-r border-slate-800 z-30">
              {/* Recording indicator */}
              {isRecording && (
                <div className="p-3 bg-red-600/20 border-b border-red-600/30 flex items-center justify-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse"></div>
                  <span className="text-red-400 font-mono font-bold">{formatTime(recordingTime)}</span>
                  <span className="text-red-400/60 text-sm ml-2">RECORDING</span>
                </div>
              )}

              {/* CURRENT INSTRUCTION - Big and prominent during recording */}
              {isRecording && (
                <div className="p-4 bg-indigo-600/20 border-b border-indigo-500/30">
                  <div className="text-indigo-400 text-xs font-bold uppercase tracking-wider mb-2">
                    <i className="fas fa-play-circle mr-1"></i>
                    NOW - Step {currentRecordingStep + 1} of {proposedSteps.length}
                  </div>
                  <p className="text-white text-lg font-bold leading-tight">
                    {proposedSteps[currentRecordingStep]}
                  </p>
                  <p className="text-indigo-300/70 text-sm mt-2">
                    Show this on camera. Press "Done" when finished.
                  </p>
                </div>
              )}

              {/* Header when not recording */}
              {!isRecording && (
                <div className="p-4 border-b border-slate-800">
                  <h3 className="text-white font-bold flex items-center gap-2">
                    <i className="fas fa-list-check text-indigo-400"></i>
                    Your Steps
                  </h3>
                  <p className="text-slate-400 text-sm mt-1">Press to start recording</p>
                </div>
              )}

              {/* Steps list - smaller during recording since current step is shown above */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {isRecording && (
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-2 px-1">All steps:</p>
                )}
                {proposedSteps.map((step, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl transition-all ${
                      idx === currentRecordingStep
                        ? 'bg-indigo-600/30 border-2 border-indigo-500'
                        : idx < currentRecordingStep
                        ? 'bg-emerald-600/20 border border-emerald-600/50'
                        : 'bg-slate-800/50 border border-slate-700 opacity-60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        idx === currentRecordingStep
                          ? 'bg-indigo-600'
                          : idx < currentRecordingStep
                          ? 'bg-emerald-600'
                          : 'bg-slate-700'
                      }`}>
                        {idx < currentRecordingStep ? (
                          <i className="fas fa-check text-white text-xs"></i>
                        ) : (
                          <span className="text-white text-sm font-bold">{idx + 1}</span>
                        )}
                      </div>
                      <p className={`text-sm flex-1 pt-1 ${
                        idx === currentRecordingStep ? 'text-white font-medium' : 'text-slate-300'
                      }`}>
                        {step}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons during recording */}
              {isRecording && (
                <div className="p-3 border-t border-slate-800 space-y-2">
                  {/* Next step / Done with current step */}
                  {currentRecordingStep < proposedSteps.length - 1 ? (
                    <button
                      onClick={() => setCurrentRecordingStep(prev => prev + 1)}
                      className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 text-lg"
                    >
                      <i className="fas fa-check mr-2"></i>
                      Done - Next Step
                    </button>
                  ) : (
                    <button
                      onClick={handleStopRecording}
                      className="w-full py-4 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 text-lg"
                    >
                      <i className="fas fa-flag-checkered mr-2"></i>
                      Done - Finish
                    </button>
                  )}

                  {/* Progress indicator */}
                  <div className="flex gap-1">
                    {proposedSteps.map((_, idx) => (
                      <div
                        key={idx}
                        className={`h-1 flex-1 rounded-full ${
                          idx < currentRecordingStep
                            ? 'bg-emerald-500'
                            : idx === currentRecordingStep
                            ? 'bg-indigo-500'
                            : 'bg-slate-700'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MOBILE: Floating current step indicator + controls */}
          {proposedSteps.length > 0 && isMobile && isRecording && (
            <div className="absolute top-0 left-0 right-0 z-30 safe-area-top">
              {/* Recording time bar */}
              <div className="flex items-center justify-center gap-2 py-2 bg-black/60 backdrop-blur-sm">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <span className="text-white font-mono text-sm font-bold">{formatTime(recordingTime)}</span>
              </div>

              {/* Current step card */}
              <div className="mx-3 mt-2 p-3 bg-indigo-600/90 backdrop-blur-sm rounded-xl">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 bg-white/20 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs font-bold">{currentRecordingStep + 1}</span>
                  </div>
                  <span className="text-white/70 text-xs">of {proposedSteps.length}</span>
                </div>
                <p className="text-white font-medium text-sm leading-tight">
                  {proposedSteps[currentRecordingStep]}
                </p>
              </div>
            </div>
          )}

          {/* MOBILE: Bottom controls during recording */}
          {proposedSteps.length > 0 && isMobile && isRecording && (
            <div className="absolute bottom-0 left-0 right-0 z-30 safe-area-bottom p-4 bg-gradient-to-t from-black/80 to-transparent">
              {/* Progress dots */}
              <div className="flex justify-center gap-1.5 mb-4">
                {proposedSteps.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full ${
                      idx < currentRecordingStep
                        ? 'bg-emerald-500'
                        : idx === currentRecordingStep
                        ? 'bg-indigo-500'
                        : 'bg-white/30'
                    }`}
                  />
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-center gap-4">
                <button
                  onClick={togglePause}
                  className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
                >
                  <i className={`fas ${isPaused ? 'fa-play' : 'fa-pause'}`}></i>
                </button>

                {currentRecordingStep < proposedSteps.length - 1 ? (
                  <button
                    onClick={() => setCurrentRecordingStep(prev => prev + 1)}
                    className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl"
                  >
                    <i className="fas fa-check mr-2"></i>
                    Next Step
                  </button>
                ) : (
                  <button
                    onClick={handleStopRecording}
                    className="px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl"
                  >
                    <i className="fas fa-flag-checkered mr-2"></i>
                    Finish
                  </button>
                )}

                <button
                  onClick={handleStopRecording}
                  className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center"
                >
                  <div className="w-4 h-4 rounded bg-white"></div>
                </button>
              </div>
            </div>
          )}

          {/* MOBILE: Start recording button (before recording starts) */}
          {proposedSteps.length > 0 && isMobile && !isRecording && (
            <div className="absolute inset-0 flex items-center justify-center z-30">
              <div className="text-center">
                <button
                  onClick={() => { setCurrentRecordingStep(0); handleStartRecording(); }}
                  className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto"
                >
                  <div className="w-16 h-16 rounded-full bg-red-500"></div>
                </button>
                <p className="text-white/70 text-sm mt-3">{proposedSteps.length} steps to record</p>
              </div>
            </div>
          )}

          {/* Right: Camera area with controls overlay (desktop only when steps exist) */}
          <div className="flex-1 relative">
            {/* Recording controls overlay - desktop with steps */}
            {!isMobile && proposedSteps.length > 0 && (
              <>
                {!isRecording ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <button
                        onClick={() => { setCurrentRecordingStep(0); handleStartRecording(); }}
                        className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto"
                      >
                        <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 transition-colors"></div>
                      </button>
                      <p className="text-white/60 text-sm mt-4">Press to start</p>
                    </div>
                  </div>
                ) : (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 z-30">
                    <button
                      onClick={togglePause}
                      className="w-14 h-14 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
                    >
                      <i className={`fas ${isPaused ? 'fa-play' : 'fa-pause'} text-lg`}></i>
                    </button>
                    <button
                      onClick={handleStopRecording}
                      className="w-16 h-16 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center"
                    >
                      <div className="w-6 h-6 rounded bg-white"></div>
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Recording controls - no steps (freestyle recording) - NOT for screen mode (has its own UI) */}
            {proposedSteps.length === 0 && !isRecording && recordingMode !== 'screen' && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <button
                    onClick={handleStartRecording}
                    className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto"
                  >
                    <div className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-400 transition-colors"></div>
                  </button>
                  <p className="text-white/60 text-sm mt-4">Press to start</p>
                </div>
              </div>
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

      {/* Simple pause overlay */}
      {isRecording && isPaused && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-25">
          <div className="max-w-md mx-4 text-center">
            <div className="w-16 h-16 bg-amber-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <i className="fas fa-pause text-amber-400 text-2xl"></i>
            </div>
            <p className="text-white text-lg font-medium mb-2">Paused</p>
            <p className="text-slate-400 mb-6">Press to continue recording</p>
            <button
              onClick={togglePause}
              className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500"
            >
              <i className="fas fa-play mr-2"></i>
              Continue
            </button>
          </div>
        </div>
      )}

      {/* Bottom controls - only show when recording WITHOUT split-screen (split-screen has its own controls) */}
      {phase === 'recording' && cameraStarted && isRecording && proposedSteps.length === 0 && (
        <div className="absolute bottom-0 left-0 right-0 p-6 safe-area-bottom z-20">
          <div className="flex items-center justify-center gap-6">
            <button
              onClick={togglePause}
              className="w-14 h-14 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center text-white"
              aria-label={isPaused ? 'Resume recording' : 'Pause recording'}
            >
              <i className={`fas ${isPaused ? 'fa-play' : 'fa-pause'} text-lg`}></i>
            </button>

            <button
              onClick={handleStopRecording}
              disabled={isFinishing}
              className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center disabled:opacity-50"
              aria-label="Stop recording"
            >
              <div className="w-8 h-8 rounded-lg bg-white"></div>
            </button>
          </div>
        </div>
      )}

      {/* Review phase - show draft SOP with AI feedback (hide during re-recording) */}
      {phase === 'review' && !isReRecording && (
        <div className="absolute inset-0 bg-slate-900 flex flex-col z-30">
          {/* Header */}
          <div className="p-3 md:p-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm safe-area-top">
            <button onClick={() => setPhase('setup')} className="text-slate-400 hover:text-white p-2">
              <i className="fas fa-arrow-left text-lg"></i>
            </button>
            <span className="text-white font-bold text-sm md:text-base">Review SOP</span>
            <button
              onClick={finalizeSOP}
              className="px-3 py-1.5 md:px-4 md:py-2 bg-emerald-600 text-white font-bold rounded-lg md:rounded-xl hover:bg-emerald-500 text-xs md:text-sm"
            >
              <i className="fas fa-check mr-1 md:mr-2"></i>
              <span className="hidden sm:inline">Finalize</span>
              <span className="sm:hidden">Done</span>
            </button>
          </div>

          {/* Two-column layout on desktop, stacked on mobile */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left: Draft SOP steps */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 md:border-r md:border-slate-800">
              <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">
                <i className="fas fa-list-check mr-2"></i>
                Draft ({draftSOP?.length || 0} steps)
              </h3>

              {draftSOP && draftSOP.map((step, idx) => (
                <div
                  key={idx}
                  className={`mb-2 md:mb-3 bg-slate-800/50 rounded-xl p-2 md:p-3 border ${
                    stepsToReRecord.includes(idx)
                      ? 'border-amber-500/50 bg-amber-900/20'
                      : 'border-slate-700'
                  }`}
                >
                  <div className="flex gap-2 md:gap-3">
                    <img
                      src={step.thumbnail}
                      alt=""
                      className="w-16 h-12 md:w-24 md:h-16 object-cover rounded-lg flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 md:gap-2 mb-0.5 md:mb-1">
                        <span className="text-indigo-400 text-[10px] md:text-xs font-bold">{idx + 1}</span>
                        {stepsToReRecord.includes(idx) && (
                          <span className="text-amber-400 text-[10px] md:text-xs">
                            <i className="fas fa-redo mr-1"></i>
                            <span className="hidden md:inline">Marked</span>
                          </span>
                        )}
                      </div>
                      <p className="text-white text-xs md:text-sm font-medium line-clamp-1">{step.title}</p>
                      <p className="text-slate-400 text-[10px] md:text-xs line-clamp-1 md:line-clamp-2 hidden sm:block">{step.description}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (stepsToReRecord.includes(idx)) {
                          setStepsToReRecord(prev => prev.filter(i => i !== idx));
                        } else {
                          setStepsToReRecord(prev => [...prev, idx]);
                        }
                      }}
                      className={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        stepsToReRecord.includes(idx)
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-700 text-slate-400 hover:text-white'
                      }`}
                      title={stepsToReRecord.includes(idx) ? 'Remove mark' : 'Mark for re-recording'}
                    >
                      <i className={`fas ${stepsToReRecord.includes(idx) ? 'fa-check' : 'fa-redo'} text-[10px] md:text-xs`}></i>
                    </button>
                  </div>
                </div>
              ))}

              {/* Re-record button */}
              {stepsToReRecord.length > 0 && (
                <button
                  onClick={startReRecording}
                  className="w-full mt-4 py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-500 transition-colors"
                >
                  <i className="fas fa-video mr-2"></i>
                  Re-record {stepsToReRecord.length} steps
                </button>
              )}
            </div>

            {/* Right: Chat/discussion - compact on mobile */}
            <div className="md:w-96 flex flex-col border-t md:border-t-0 border-slate-800 bg-slate-900/50 max-h-[35vh] md:max-h-none md:min-h-0">
              <div className="p-2 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-slate-400 text-[10px] md:text-sm font-bold uppercase">
                  <i className="fas fa-lightbulb mr-1 text-amber-400"></i>
                  Tips
                </h3>
                {/* Quick actions on mobile */}
                {isMobile && stepsToReRecord.length === 0 && (
                  <button
                    onClick={finalizeSOP}
                    className="text-emerald-400 text-xs font-bold"
                  >
                    OK ✓
                  </button>
                )}
              </div>

              {/* Chat messages - smaller on mobile with visible scrollbar */}
              <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 max-h-[120px] md:max-h-none scrollbar-thin">
                {reviewChatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[90%] md:max-w-[85%] p-2 md:p-3 rounded-xl text-xs md:text-sm whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-100'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat input - compact on mobile */}
              <div className="p-1.5 md:p-3 border-t border-slate-800 safe-area-bottom">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={reviewInput}
                    onChange={(e) => setReviewInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleReviewChat(reviewInput)}
                    placeholder="'redo step 3'..."
                    className="flex-1 bg-slate-800 text-white px-2 py-1.5 md:px-3 md:py-2 rounded-lg md:rounded-xl border border-slate-700 focus:border-indigo-500 outline-none text-[11px] md:text-sm"
                  />
                  <button
                    onClick={() => handleReviewChat(reviewInput)}
                    disabled={!reviewInput.trim()}
                    className="px-2.5 md:px-4 py-1.5 md:py-2 bg-indigo-600 text-white font-bold rounded-lg md:rounded-xl hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <i className="fas fa-paper-plane text-xs md:text-sm"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Re-recording overlay */}
      {isReRecording && reRecordStepIndex !== null && draftSOP && (
        <div className="absolute inset-0 z-35">
          {/* Video still showing in background */}
          <div className="absolute top-16 md:top-20 left-3 right-3 md:left-4 md:right-4 z-20 safe-area-top">
            <div className="bg-amber-600/90 backdrop-blur-sm rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="w-8 h-8 md:w-10 md:h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm md:text-base">{reRecordStepIndex + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white/80 text-[10px] md:text-xs uppercase tracking-wider">Re-recording</p>
                  <p className="text-white font-medium text-sm md:text-base truncate">{draftSOP[reRecordStepIndex]?.title}</p>
                </div>
                <button
                  onClick={handleReRecordComplete}
                  className="px-3 md:px-4 py-1.5 md:py-2 bg-white text-amber-600 font-bold rounded-lg text-sm"
                >
                  <i className="fas fa-check mr-1"></i>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analyzing overlay (before review phase) */}
      {isAnalyzingReview && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-40">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white text-lg font-bold">Analyzing recording...</p>
            <p className="text-slate-400 text-sm mt-1">{allFramesRef.current.length} frames being processed</p>
          </div>
        </div>
      )}

      {/* Finishing overlay */}
      {isFinishing && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-40">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-white text-lg font-bold">Creating SOP...</p>
            <p className="text-slate-400 text-sm mt-1">{allFramesRef.current.length} frames being analyzed</p>
          </div>
        </div>
      )}

      {/* Settings panel */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-end md:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowSettings(false)} />
          <div className="relative bg-slate-900 w-full md:w-96 md:rounded-2xl p-6 space-y-6 rounded-t-3xl">
            <div className="flex items-center justify-between">
              <h3 className="text-white text-lg font-bold">Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                <i className="fas fa-times"></i>
              </button>
            </div>

            {/* Scene Sensitivity */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-white text-sm font-medium">Sensitivity</label>
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
                {sceneSensitivity < 30 ? 'Fewer frames, only major changes' :
                 sceneSensitivity < 70 ? 'Balanced' : 'More frames, more details'}
              </p>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 transition-colors"
            >
              Done
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
                Steps <span className="text-indigo-400">({liveSteps.length})</span>
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
                    <p className="text-white text-sm font-medium truncate">{step.title || `Step ${idx + 1}`}</p>
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
          <button className="absolute top-4 right-4 text-white/60 hover:text-white z-10" aria-label="Close preview">
            <i className="fas fa-times text-2xl"></i>
          </button>
          <img src={previewImage} alt="" className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </div>
  );
};

export default LiveSOPGenerator;
