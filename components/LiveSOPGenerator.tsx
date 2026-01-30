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
  freeSOPsRemaining = 3,
  isPro = false,
  onUpgrade
}) => {
  const canCreate = isPro || freeSOPsRemaining > 0;

  // Phase state: mode-select -> setup -> recording -> review -> finishing
  const [phase, setPhase] = useState<'mode-select' | 'setup' | 'recording' | 'review' | 'finishing'>('mode-select');

  // Content mode: affects AI tone and output style
  const [contentMode, setContentMode] = useState<'sop' | 'creator'>('sop');

  // AI Guide state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [userInput, setUserInput] = useState('');
  const [proposedSteps, setProposedSteps] = useState<string[]>([]); // Steps being planned
  const [isReady, setIsReady] = useState(false); // AI thinks we're ready to record
  const [isGeneratingGuide, setIsGeneratingGuide] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
  const [editingStepText, setEditingStepText] = useState('');

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

  // Fullscreen image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Camera permission state (iOS Safari requires user gesture to start camera)
  const [cameraStarted, setCameraStarted] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

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

  // Handle chat message in setup phase - always use structured response
  const handleSetupChat = async (message: string) => {
    if (!message.trim()) return;

    setUserInput(''); // Clear input immediately
    setIsGeneratingGuide(true);
    setChatMessages(prev => [...prev, { role: 'user', content: message }]);

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
          contentMode, // 'sop' or 'creator' - affects AI tone
          steps: proposedSteps.map(s => ({ title: s, description: s })),
          previousMessages: chatMessages.slice(-6)
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
          content: 'Beskriv vad du ska visa så hjälper jag dig skapa steg!'
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
    setProposedSteps(prev => [...prev, 'Nytt steg...']);
    setEditingStepIndex(proposedSteps.length);
    setEditingStepText('');
  };

  // Select content mode and start setup
  const selectMode = (mode: 'sop' | 'creator') => {
    setContentMode(mode);
    setChatMessages([{
      role: 'ai',
      content: mode === 'sop'
        ? 'Hej! Beskriv arbetsrutinen du ska dokumentera så skapar jag en steg-för-steg guide.'
        : 'Hej! Vad ska du skapa idag? Beskriv din video-idé så hjälper jag dig planera innehållet!'
    }]);
    setPhase('setup');
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
      const frames = allFramesRef.current.map(f => f.image);
      const spokenContext = transcriptRef.current.trim();

      if (frames.length === 0) {
        alert('Inga bilder fångades. Försök igen.');
        setIsAnalyzingReview(false);
        setPhase('setup');
        return;
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

      // Create context - TRANSCRIPT IS PRIMARY SOURCE
      let contextWithTranscript = '';
      if (finalTranscript) {
        contextWithTranscript = `EXPERT TRANSCRIPT (this is the primary source - use what the expert says):\n"""\n${finalTranscript}\n"""\n\nINSTRUCTION: Convert this transcript into a formal step-by-step manual. Each step must be a direct command. The expert's words are the source of truth.`;
      } else {
        // Add soft tips if user provided description
        if (softTips.length > 0) {
          contextWithTranscript = `User mentioned they would show: ${softTips.join(', ')}. But analyze the actual video content to create steps.`;
        }
      }

      const result = await analyzeSOPFrames(frames, title, contextWithTranscript, [], []);
      console.log('Gemini returned steps:', result.steps.length);

      // Map to draft steps with thumbnails
      const draftSteps: SOPStep[] = result.steps.map((step, idx) => ({
        ...step,
        thumbnail: frames[Math.min(idx, frames.length - 1)],
        timestamp: allFramesRef.current[Math.min(idx, allFramesRef.current.length - 1)]?.timestamp
          ? formatTime(allFramesRef.current[Math.min(idx, allFramesRef.current.length - 1)].timestamp)
          : step.timestamp
      }));

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
          ? `Här är din SOP med ${draftSteps.length} steg. Jag har några förslag:\n\n${feedback.map((f, i) => `${i + 1}. ${f}`).join('\n')}\n\nVill du göra om något steg, eller är du nöjd?`
          : `Bra jobbat! Här är din SOP med ${draftSteps.length} steg. Ser det bra ut, eller vill du ändra något?`
      }]);

      setPhase('review');
    } catch (err: any) {
      console.error('Error creating draft SOP:', err);
      alert(`Fel vid analys: ${err.message}`);
      setPhase('setup');
    } finally {
      setIsAnalyzingReview(false);
    }
  };

  // Get AI feedback on draft SOP
  const getAIFeedbackOnDraft = async (steps: SOPStep[], transcript: string): Promise<string[]> => {
    try {
      const response = await fetch('https://frameops-production.up.railway.app/review-sop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steps: steps.map(s => ({ title: s.title, description: s.description })),
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
    const reRecordMatch = message.match(/steg\s*(\d+)/i) || message.match(/(\d+)/);
    if (reRecordMatch && (message.toLowerCase().includes('om') || message.toLowerCase().includes('visa') || message.toLowerCase().includes('spela'))) {
      const stepNum = parseInt(reRecordMatch[1]);
      if (stepNum > 0 && stepNum <= (draftSOP?.length || 0)) {
        setReviewChatMessages(prev => [...prev, {
          role: 'ai',
          content: `Ok, jag markerar steg ${stepNum} för ominspelning. Tryck "Spela om markerade steg" när du är redo.`
        }]);
        setStepsToReRecord(prev => prev.includes(stepNum - 1) ? prev : [...prev, stepNum - 1]);
        return;
      }
    }

    // Check for approval
    if (message.toLowerCase().includes('bra') || message.toLowerCase().includes('ok') || message.toLowerCase().includes('nöjd') || message.toLowerCase().includes('klar')) {
      setReviewChatMessages(prev => [...prev, {
        role: 'ai',
        content: 'Perfekt! Tryck "Slutför SOP" för att spara.'
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
        content: 'Jag förstod inte riktigt. Vill du göra om något steg? Säg t.ex. "visa steg 3 igen".'
      }]);
    }
  };

  // Start re-recording specific steps
  const startReRecording = () => {
    if (stepsToReRecord.length === 0) return;
    setReRecordStepIndex(stepsToReRecord[0]);
    setIsReRecording(true);
    // Reset recording state for re-record
    recordedChunksRef.current = [];
    setRecordingTime(0);
    recordingTimeRef.current = 0;
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
        content: `Steg ${reRecordStepIndex + 1} uppdaterat! Nu är det steg ${remaining[0] + 1}: "${draftSOP[remaining[0]]?.title}"`
      }]);
    } else {
      // Done re-recording
      setIsReRecording(false);
      setReRecordStepIndex(null);
      setReviewChatMessages(prev => [...prev, {
        role: 'ai',
        content: 'Alla steg uppdaterade! Ser det bättre ut nu?'
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
          aria-label="Cancel"
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
            aria-label="Settings"
          >
            <i className="fas fa-cog"></i>
          </button>
        ) : <div className="w-10" />}
      </div>

      {/* Mode selection */}
      {phase === 'mode-select' && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-black flex flex-col z-30">
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-slate-800">
            <button onClick={handleCancel} className="text-slate-400 hover:text-white">
              <i className="fas fa-times text-xl"></i>
            </button>
            <span className="text-white font-bold">Live SOP</span>
            <div className="w-8"></div>
          </div>

          {/* Mode selection cards */}
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="max-w-lg w-full space-y-4">
              <h2 className="text-white text-2xl font-bold text-center mb-8">
                Vad skapar du idag?
              </h2>

              {/* SOP Mode */}
              <button
                onClick={() => selectMode('sop')}
                className="w-full p-6 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500 rounded-2xl text-left transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-indigo-600/20 rounded-xl flex items-center justify-center group-hover:bg-indigo-600/30 transition-colors">
                    <i className="fas fa-clipboard-list text-indigo-400 text-2xl"></i>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-bold text-lg">Arbetsrutin / SOP</h3>
                    <p className="text-slate-400 text-sm mt-1">
                      Dokumentera en process steg för steg. Perfekt för instruktioner, manualer och rutiner.
                    </p>
                  </div>
                  <i className="fas fa-chevron-right text-slate-600 group-hover:text-indigo-400 mt-4"></i>
                </div>
              </button>

              {/* Creator Mode */}
              <button
                onClick={() => selectMode('creator')}
                className="w-full p-6 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-pink-500 rounded-2xl text-left transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-pink-600/20 rounded-xl flex items-center justify-center group-hover:bg-pink-600/30 transition-colors">
                    <i className="fas fa-video text-pink-400 text-2xl"></i>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-white font-bold text-lg">Tutorial / Content</h3>
                    <p className="text-slate-400 text-sm mt-1">
                      Skapa engagerande tutorials och how-to videos. Fokus på storytelling och tittarupplevelse.
                    </p>
                  </div>
                  <i className="fas fa-chevron-right text-slate-600 group-hover:text-pink-400 mt-4"></i>
                </div>
              </button>

              {/* Skip option */}
              <button
                onClick={skipToRecording}
                className="w-full py-3 text-slate-500 hover:text-slate-400 text-sm"
              >
                <i className="fas fa-forward mr-2"></i>
                Hoppa över och spela in direkt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup phase - SPLIT VIEW: Steps + Chat */}
      {phase === 'setup' && !cameraStarted && (
        <div className="absolute inset-0 bg-slate-900 flex flex-col z-30">
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-slate-800">
            <button onClick={handleCancel} className="text-slate-400 hover:text-white">
              <i className="fas fa-times text-xl"></i>
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center">
                <i className="fas fa-video text-white text-sm"></i>
              </div>
              <span className="text-white font-bold">Planera inspelning</span>
            </div>
            <div className="w-8"></div>
          </div>

          {/* Split view: Steps left, Chat right */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left: Steps panel */}
            <div className="md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/50">
              <div className="p-4 border-b border-slate-800">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <i className="fas fa-list-check text-indigo-400"></i>
                  Steg att filma
                  {proposedSteps.length > 0 && (
                    <span className="text-slate-400 font-normal text-sm">({proposedSteps.length})</span>
                  )}
                </h3>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {proposedSteps.length === 0 ? (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4">
                      <i className="fas fa-lightbulb text-slate-600 text-2xl"></i>
                    </div>
                    <p className="text-slate-500 text-sm">Beskriv vad du ska visa så skapar AI:n stegen</p>
                  </div>
                ) : (
                  proposedSteps.map((step, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-800/50 rounded-xl p-3 border border-slate-700 group"
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
                        <div className="flex items-start gap-3">
                          <div className="w-7 h-7 bg-indigo-600/30 rounded-full flex items-center justify-center flex-shrink-0">
                            <span className="text-indigo-300 text-sm font-bold">{idx + 1}</span>
                          </div>
                          <p className="text-white text-sm flex-1 pt-1">{step}</p>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => handleStepEdit(idx)}
                              className="w-7 h-7 bg-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-white"
                            >
                              <i className="fas fa-pen text-xs"></i>
                            </button>
                            <button
                              onClick={() => deleteStep(idx)}
                              className="w-7 h-7 bg-slate-700 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-400"
                            >
                              <i className="fas fa-trash text-xs"></i>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}

                {/* Add step button */}
                {proposedSteps.length > 0 && (
                  <button
                    onClick={addStep}
                    className="w-full py-2 border-2 border-dashed border-slate-700 rounded-xl text-slate-500 hover:border-slate-600 hover:text-slate-400 transition-colors text-sm"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Lägg till steg
                  </button>
                )}
              </div>

              {/* Start recording button */}
              <div className="p-4 border-t border-slate-800">
                <button
                  onClick={skipToRecording}
                  disabled={proposedSteps.length === 0}
                  className={`w-full py-4 font-bold text-lg rounded-xl transition-colors ${
                    proposedSteps.length > 0
                      ? 'bg-red-600 text-white hover:bg-red-500'
                      : 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  <i className="fas fa-video mr-2"></i>
                  {proposedSteps.length > 0 ? 'Starta inspelning' : 'Skapa steg först...'}
                </button>
                {proposedSteps.length === 0 && (
                  <button
                    onClick={skipToRecording}
                    className="w-full mt-2 py-2 text-slate-500 hover:text-slate-400 text-sm"
                  >
                    Eller spela in utan plan
                  </button>
                )}
              </div>
            </div>

            {/* Right: Chat panel */}
            <div className="md:w-1/2 flex flex-col">
              <div className="p-4 border-b border-slate-800">
                <h3 className="text-white font-bold flex items-center gap-2">
                  <i className="fas fa-comments text-indigo-400"></i>
                  AI-assistent
                </h3>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-xl text-sm whitespace-pre-line ${
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
                    <div className="bg-slate-800 text-slate-100 p-3 rounded-xl text-sm">
                      <i className="fas fa-circle-notch fa-spin mr-2"></i>
                      Tänker...
                    </div>
                  </div>
                )}
                <div ref={(el) => el?.scrollIntoView({ behavior: 'smooth' })} />
              </div>

              {/* Chat input */}
              <div className="p-4 border-t border-slate-800">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && userInput.trim() && handleSetupChat(userInput.trim())}
                    placeholder="Beskriv vad du ska filma..."
                    className="flex-1 bg-slate-800 text-white px-4 py-3 rounded-xl border border-slate-700 focus:border-indigo-500 outline-none text-sm"
                    disabled={isGeneratingGuide}
                  />
                  <button
                    onClick={() => userInput.trim() && handleSetupChat(userInput.trim())}
                    disabled={!userInput.trim() || isGeneratingGuide}
                    className="px-5 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <i className="fas fa-paper-plane"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Setup phase - camera view with start button (after camera started) */}
      {phase === 'setup' && cameraStarted && !isRecording && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="text-center max-w-md mx-4">
            <div className="bg-black/70 backdrop-blur-sm rounded-2xl p-6 mb-4">
              <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-microphone text-indigo-400 text-2xl"></i>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">Redo att spela in</h3>
              <p className="text-slate-300 text-sm mb-4">
                Berätta vad du gör medan du gör det.
              </p>
              {proposedSteps.length > 0 && (
                <div className="text-left bg-slate-800/50 rounded-xl p-3">
                  <p className="text-slate-400 text-xs uppercase tracking-wider mb-2">Dina steg:</p>
                  {proposedSteps.map((step, i) => (
                    <p key={i} className="text-slate-300 text-sm">{i + 1}. {step}</p>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleStartRecording}
              className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto"
            >
              <div className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 transition-colors"></div>
            </button>
            <p className="text-white/60 text-sm mt-4">Tryck för att börja spela in</p>
          </div>
        </div>
      )}

      {/* Recording phase - camera view with start button (if not started yet) */}
      {phase === 'recording' && !cameraStarted && (
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 to-black flex items-center justify-center z-30">
          <div className="text-center">
            <button
              onClick={startCamera}
              className="px-8 py-4 bg-indigo-600 text-white font-bold text-lg rounded-2xl hover:bg-indigo-500 transition-colors"
            >
              <i className="fas fa-video mr-3"></i>
              Starta kameran
            </button>
            {cameraError && (
              <div className="mt-4 bg-red-600/20 border border-red-500/50 rounded-xl p-4 max-w-md">
                <p className="text-red-400 text-sm">{cameraError}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Recording phase - ready to record */}
      {phase === 'recording' && cameraStarted && !isRecording && (
        <div className="absolute inset-0 flex items-center justify-center z-30">
          <div className="text-center max-w-md mx-4">
            <div className="bg-black/70 backdrop-blur-sm rounded-2xl p-6 mb-4">
              <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="fas fa-microphone text-indigo-400 text-2xl"></i>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">Redo att spela in</h3>
              <p className="text-slate-300 text-sm">
                Berätta vad du gör medan du gör det. Din röst blir grunden för SOP:en.
              </p>
            </div>
            <button
              onClick={handleStartRecording}
              className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center mx-auto"
            >
              <div className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 transition-colors"></div>
            </button>
            <p className="text-white/60 text-sm mt-4">Tryck för att börja spela in</p>
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
            <p className="text-white text-lg font-medium mb-2">Pausad</p>
            <p className="text-slate-400 mb-6">Tryck för att fortsätta spela in</p>
            <button
              onClick={togglePause}
              className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500"
            >
              <i className="fas fa-play mr-2"></i>
              Fortsätt
            </button>
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
            </>
          )}
        </div>
      </div>

      {/* Review phase - show draft SOP with AI feedback */}
      {phase === 'review' && (
        <div className="absolute inset-0 bg-slate-900 flex flex-col z-30">
          {/* Header */}
          <div className="p-4 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm">
            <button onClick={() => setPhase('setup')} className="text-slate-400 hover:text-white">
              <i className="fas fa-arrow-left text-xl"></i>
            </button>
            <span className="text-white font-bold">Granska SOP</span>
            <button
              onClick={finalizeSOP}
              className="px-4 py-2 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 text-sm"
            >
              <i className="fas fa-check mr-2"></i>
              Slutför
            </button>
          </div>

          {/* Two-column layout on desktop, tabs on mobile */}
          <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
            {/* Left: Draft SOP steps */}
            <div className="flex-1 overflow-y-auto p-4 md:border-r md:border-slate-800">
              <h3 className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-4">
                <i className="fas fa-list-check mr-2"></i>
                Draft ({draftSOP?.length || 0} steg)
              </h3>

              {draftSOP && draftSOP.map((step, idx) => (
                <div
                  key={idx}
                  className={`mb-3 bg-slate-800/50 rounded-xl p-3 border ${
                    stepsToReRecord.includes(idx)
                      ? 'border-amber-500/50 bg-amber-900/20'
                      : 'border-slate-700'
                  }`}
                >
                  <div className="flex gap-3">
                    <img
                      src={step.thumbnail}
                      alt=""
                      className="w-24 h-16 object-cover rounded-lg flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-indigo-400 text-xs font-bold">Steg {idx + 1}</span>
                        {stepsToReRecord.includes(idx) && (
                          <span className="text-amber-400 text-xs">
                            <i className="fas fa-redo mr-1"></i>Markerad
                          </span>
                        )}
                      </div>
                      <p className="text-white text-sm font-medium line-clamp-1">{step.title}</p>
                      <p className="text-slate-400 text-xs line-clamp-2">{step.description}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (stepsToReRecord.includes(idx)) {
                          setStepsToReRecord(prev => prev.filter(i => i !== idx));
                        } else {
                          setStepsToReRecord(prev => [...prev, idx]);
                        }
                      }}
                      className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        stepsToReRecord.includes(idx)
                          ? 'bg-amber-600 text-white'
                          : 'bg-slate-700 text-slate-400 hover:text-white'
                      }`}
                      title={stepsToReRecord.includes(idx) ? 'Ta bort markering' : 'Markera för ominspelning'}
                    >
                      <i className={`fas ${stepsToReRecord.includes(idx) ? 'fa-check' : 'fa-redo'} text-xs`}></i>
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
                  Spela om {stepsToReRecord.length} steg
                </button>
              )}
            </div>

            {/* Right: Chat/discussion */}
            <div className="md:w-96 flex flex-col border-t md:border-t-0 border-slate-800 bg-slate-900/50">
              <div className="p-3 border-b border-slate-800">
                <h3 className="text-slate-400 text-sm font-bold">
                  <i className="fas fa-comments mr-2"></i>
                  Diskutera
                </h3>
              </div>

              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-64 md:max-h-none">
                {reviewChatMessages.map((msg, idx) => (
                  <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] p-3 rounded-xl text-sm whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-100'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>

              {/* Chat input */}
              <div className="p-3 border-t border-slate-800">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={reviewInput}
                    onChange={(e) => setReviewInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleReviewChat(reviewInput)}
                    placeholder="Säg t.ex. 'visa steg 3 igen'..."
                    className="flex-1 bg-slate-800 text-white px-3 py-2 rounded-xl border border-slate-700 focus:border-indigo-500 outline-none text-sm"
                  />
                  <button
                    onClick={() => handleReviewChat(reviewInput)}
                    disabled={!reviewInput.trim()}
                    className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <i className="fas fa-paper-plane"></i>
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
          <div className="absolute top-20 left-4 right-4 z-20">
            <div className="bg-amber-600/90 backdrop-blur-sm rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">{reRecordStepIndex + 1}</span>
                </div>
                <div className="flex-1">
                  <p className="text-white/80 text-xs uppercase tracking-wider">Spelar om steg</p>
                  <p className="text-white font-medium">{draftSOP[reRecordStepIndex]?.title}</p>
                </div>
                <button
                  onClick={handleReRecordComplete}
                  className="px-4 py-2 bg-white text-amber-600 font-bold rounded-lg"
                >
                  <i className="fas fa-check mr-1"></i>
                  Klar
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
            <p className="text-white text-lg font-bold">Analyserar inspelning...</p>
            <p className="text-slate-400 text-sm mt-1">{allFramesRef.current.length} bilder bearbetas</p>
          </div>
        </div>
      )}

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
