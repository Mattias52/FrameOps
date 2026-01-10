import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SOP, SOPStep } from '../types';
import { analyzeSOPFrames, transcribeAudioFile } from '../services/geminiService';

interface LiveSOPGeneratorProps {
  onComplete: (sop: SOP) => void;
  onCancel: () => void;
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

const LiveSOPGenerator: React.FC<LiveSOPGeneratorProps> = ({ onComplete, onCancel }) => {
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
  // sensitivity 0 = threshold 0.30 (very few frames - only major changes)
  // sensitivity 50 = threshold 0.12 (balanced)
  // sensitivity 100 = threshold 0.03 (many frames - capture small changes)
  const SCENE_THRESHOLD = 0.30 - (sceneSensitivity / 100) * 0.27;
  // Minimum seconds between captures (even if scene changes)
  // sensitivity 0 = 10 sec, sensitivity 50 = 5 sec, sensitivity 100 = 2 sec
  const MIN_CAPTURE_INTERVAL = Math.max(2, 10 - (sceneSensitivity / 100) * 8);
  const MAX_FRAMES = 50; // Max frames to capture

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
    setSpeechSupported(false); // Not using browser speech API
    setSpeechError(null);
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

  // Stop recording and finalize SOP
  const handleStopRecording = async () => {
    if (!isRecording) return;

    // Stop speech recognition
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      speechRecognitionRef.current = null;
    }

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
      if (hasAudioBlob && !spokenContext) {
        console.log('Transcribing audio with Gemini:', audioBlobRef.current?.size, 'bytes');
        try {
          audioTranscript = await transcribeAudioFile(audioBlobRef.current!);
          console.log('Audio transcription complete:', audioTranscript.substring(0, 100));
        } catch (err) {
          console.error('Audio transcription failed:', err);
        }
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

      // Create final SOP
      const sop: SOP = {
        id: Math.random().toString(36).substr(2, 9),
        title: result.title || title,
        description: result.description,
        ppeRequirements: result.ppeRequirements,
        materialsRequired: result.materialsRequired,
        createdAt: new Date().toISOString(),
        sourceType: 'live',
        status: 'completed',
        steps: finalSteps
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
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col md:flex-row">
      {/* Camera View - Full screen on mobile, left side on desktop */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header */}
        <div className="p-3 md:p-4 flex items-center justify-between bg-black/50 safe-area-top">
          <div className="flex items-center gap-2 md:gap-4 flex-1 min-w-0">
            <button
              onClick={handleCancel}
              className="w-10 h-10 md:w-10 md:h-10 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 active:scale-95 transition-transform flex-shrink-0"
            >
              <i className="fas fa-arrow-left"></i>
            </button>
            <div className="min-w-0 flex-1">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="SOP Title..."
                className="bg-transparent text-white text-base md:text-lg font-bold border-none outline-none placeholder:text-white/50 w-full"
              />
              <p className="text-white/50 text-[10px] md:text-xs font-medium">Live SOP Recording</p>
            </div>
          </div>

          {isRecording && (
            <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
              <div className={`w-2.5 h-2.5 md:w-3 md:h-3 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`}></div>
              <span className="text-white font-mono text-base md:text-lg font-bold">{formatTime(recordingTime)}</span>
            </div>
          )}
        </div>

        {/* Video Preview */}
        <div className="flex-1 relative bg-black min-h-0">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="w-full h-full object-cover md:object-contain"
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Camera start overlay - iOS Safari requires user gesture */}
          {!cameraStarted && (
            <div className="absolute inset-0 bg-slate-900/95 flex items-center justify-center z-[100]">
              <div className="text-center p-6 max-w-sm">
                <button 
                  className="w-24 h-24 md:w-32 md:h-32 bg-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 cursor-pointer hover:bg-indigo-700 active:scale-95 transition-all shadow-2xl ring-4 ring-white/20"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startCamera();
                  }}
                >
                  <i className="fas fa-video text-white text-4xl md:text-5xl"></i>
                </button>
                <h3 className="text-white text-xl md:text-2xl font-bold mb-2">Tap the circle above</h3>
                <p className="text-slate-400 text-sm md:text-base mb-4">We need to start the camera before recording</p>
                
                {/* Scene Sensitivity Slider */}
                <div className="bg-slate-800/80 rounded-xl p-4 mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-white/80 text-sm font-medium">Scene Sensitivity</label>
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
                  <div className="flex justify-between text-xs text-slate-500 mt-1">
                    <span>Fewer frames</span>
                    <span>More frames</span>
                  </div>
                  <p className="text-slate-400 text-xs mt-2">
                    {sceneSensitivity < 30 ? '🎯 Only major scene changes' : 
                     sceneSensitivity < 70 ? '⚖️ Balanced capture' : 
                     '📸 Capture more details'}
                  </p>
                </div>
                {cameraError && (
                  <div className="bg-red-600/20 border border-red-500 rounded-lg p-3 max-w-xs mx-auto">
                    <p className="text-red-400 text-sm">{cameraError}</p>
                    <button 
                      onClick={startCamera}
                      className="mt-2 text-red-300 hover:text-white text-sm underline">
                      Try again
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recording indicator overlay */}
          {isRecording && !isPaused && (
            <div className="absolute top-3 right-3 md:top-4 md:right-4 flex items-center gap-2 bg-red-600 px-2.5 py-1 md:px-3 md:py-1.5 rounded-full">
              <div className="w-1.5 h-1.5 md:w-2 md:h-2 bg-white rounded-full animate-pulse"></div>
              <span className="text-white text-[10px] md:text-xs font-bold uppercase">REC</span>
            </div>
          )}

          {/* Speech recognition indicator */}
          {isRecording && (
            <div className="absolute top-3 left-3 md:top-4 md:left-4 flex flex-col gap-2 max-w-[60%]">
              {/* Microphone status */}
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${isListening ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                <i className={`fas fa-microphone text-white ${isListening ? 'animate-pulse' : ''}`}></i>
                <span className="text-white text-xs font-medium">
                  {isListening ? 'Listening...' : (speechSupported ? 'Mic starting...' : 'No mic')}
                </span>
              </div>

              {/* Live transcript preview */}
              {(currentTranscript || transcriptRef.current) && (
                <div className="bg-black/70 backdrop-blur-sm px-3 py-2 rounded-lg max-w-full">
                  <p className="text-white/90 text-xs line-clamp-2">
                    {currentTranscript || transcriptRef.current.slice(-100)}
                  </p>
                </div>
              )}

              {/* Speech error with retry */}
              {speechError && (
                <div className="bg-red-600/90 px-3 py-2 rounded-lg flex items-center gap-2">
                  <p className="text-white text-xs flex-1">{speechError}</p>
                  <button
                    onClick={() => {
                      setSpeechError(null);
                      setSpeechSupported(true);
                      startSpeechRecognition();
                    }}
                    className="text-white/80 hover:text-white text-xs underline"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Audio fallback indicator */}
              {hasAudioFallback && audioRecordingActive && (
                <div className="bg-emerald-600/90 px-3 py-2 rounded-lg flex items-center gap-2">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  <p className="text-white text-xs font-medium">Recording audio for AI transcription</p>
                </div>
              )}

              {/* No speech - show it's optional */}
              {!speechSupported && !speechError && !hasAudioFallback && (
                <div className="bg-slate-700/90 px-3 py-1.5 rounded-lg">
                  <p className="text-white/70 text-xs">Recording without speech</p>
                </div>
              )}
            </div>
          )}

          {/* Mobile: Steps count badge */}
          {isMobile && liveSteps.length > 0 && (
            <button
              onClick={() => setShowStepsPanel(true)}
              className="absolute bottom-3 right-3 bg-indigo-600 text-white px-3 py-2 rounded-full flex items-center gap-2 active:scale-95 transition-transform shadow-lg"
            >
              <i className="fas fa-list-ol text-sm"></i>
              <span className="text-sm font-bold">{liveSteps.length} steps</span>
            </button>
          )}

          {/* Finishing overlay */}
          {isFinishing && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4">
              <div className="text-center">
                <div className="w-12 h-12 md:w-16 md:h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3 md:mb-4"></div>
                <p className="text-white text-base md:text-lg font-bold">Generating SOP...</p>
                <p className="text-white/60 text-xs md:text-sm">AI is analyzing {allFramesRef.current.length} captured frames</p>
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="p-4 md:p-6 bg-black/50 flex items-center justify-center gap-4 md:gap-6 safe-area-bottom">
          {!isRecording ? (
            <button
              onClick={(e) => {
                console.log("Direct click on record button");
                if (!cameraStarted) {
                  alert('Du måste starta kameran först! Klicka på den stora knappen i mitten av skärmen.');
                  return;
                }
                handleStartRecording();
              }}
              className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-full flex items-center justify-center group active:scale-95 transition-transform shadow-xl"
              style={{ pointerEvents: 'auto', zIndex: 50 }}
            >
              <div className={`w-12 h-12 md:w-16 md:h-16 rounded-full group-active:bg-red-700 transition-colors ${cameraStarted ? 'bg-red-600' : 'bg-slate-400'}`}></div>
            </button>
          ) : (
            <>
              <button
                onClick={togglePause}
                className="w-12 h-12 md:w-14 md:h-14 bg-white/10 rounded-full flex items-center justify-center text-white active:bg-white/30 transition-colors"
              >
                <i className={`fas ${isPaused ? 'fa-play' : 'fa-pause'} text-lg md:text-xl`}></i>
              </button>

              <button
                onClick={handleStopRecording}
                disabled={isFinishing}
                className="w-16 h-16 md:w-20 md:h-20 bg-white rounded-full flex items-center justify-center group active:scale-95 transition-transform disabled:opacity-50 shadow-xl"
              >
                <div className="w-6 h-6 md:w-8 md:h-8 bg-slate-900 rounded-md md:rounded-lg"></div>
              </button>

              {/* Mobile: Show steps button */}
              {isMobile ? (
                <button
                  onClick={() => setShowStepsPanel(true)}
                  className="w-12 h-12 md:w-14 md:h-14 bg-white/10 rounded-full flex items-center justify-center text-white active:bg-white/30 transition-colors relative"
                >
                  <i className="fas fa-list-ol text-lg"></i>
                  {liveSteps.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-indigo-600 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
                      {liveSteps.length}
                    </span>
                  )}
                </button>
              ) : (
                <div className="w-14 h-14"></div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Desktop: Live Steps Preview - Right panel */}
      {!isMobile && (
        <div className="w-80 lg:w-96 bg-slate-800 flex flex-col border-l border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h3 className="text-white font-bold flex items-center gap-2">
              <i className="fas fa-list-ol text-indigo-400"></i>
              Live Steps
              <span className="ml-auto bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">
                {liveSteps.length}
              </span>
            </h3>
            <p className="text-slate-400 text-xs mt-1">Steps appear as you record</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {liveSteps.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-video text-slate-500 text-2xl"></i>
                </div>
                <p className="text-slate-400 text-sm font-medium">Start recording to capture steps</p>
                <p className="text-slate-500 text-xs mt-1">Steps will appear here automatically</p>
              </div>
            ) : (
              liveSteps.map((step, idx) => (
                <div
                  key={step.id}
                  className="bg-slate-700/50 rounded-xl overflow-hidden animate-in slide-in-from-right duration-300"
                >
                  <div
                    className="relative aspect-video cursor-pointer group"
                    onClick={() => setPreviewImage(step.thumbnail)}
                  >
                    <img
                      src={step.thumbnail}
                      alt={`Step ${idx + 1}`}
                      className="w-full h-full object-cover transition-transform group-hover:scale-105"
                      crossOrigin="anonymous"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <i className="fas fa-search-plus text-white text-xl opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                    <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded text-white text-xs font-mono">
                      {step.timestamp}
                    </div>
                    <div className="absolute top-2 right-2 bg-indigo-600 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {idx + 1}
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="text-white text-sm font-bold line-clamp-1">
                      {step.status === 'capturing' ? (
                        <span className="text-slate-400 flex items-center gap-2">
                          <i className="fas fa-circle-notch fa-spin text-indigo-400"></i>
                          Captured
                        </span>
                      ) : step.title}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Stats */}
          {isRecording && (
            <div className="p-4 border-t border-slate-700 grid grid-cols-2 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{liveSteps.length}</p>
                <p className="text-slate-400 text-xs uppercase">Steps</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-white">{formatTime(recordingTime)}</p>
                <p className="text-slate-400 text-xs uppercase">Duration</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen Image Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-70 bg-black/95 flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <button
            className="absolute top-4 right-4 w-12 h-12 bg-white/10 rounded-full flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
            onClick={() => setPreviewImage(null)}
          >
            <i className="fas fa-times text-xl"></i>
          </button>
          <img
            src={previewImage}
            alt="Full preview"
            className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
            crossOrigin="anonymous"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            Tap anywhere or ✕ to close
          </p>
        </div>
      )}

      {/* Mobile: Bottom Sheet for Steps */}
      {isMobile && showStepsPanel && (
        <div className="fixed inset-0 z-60 flex flex-col">
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowStepsPanel(false)}
          />

          {/* Bottom Sheet */}
          <div className="bg-slate-800 rounded-t-3xl max-h-[70vh] flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="w-10 h-1 bg-slate-600 rounded-full"></div>
            </div>

            {/* Header */}
            <div className="px-4 pb-3 flex items-center justify-between border-b border-slate-700">
              <div>
                <h3 className="text-white font-bold flex items-center gap-2">
                  <i className="fas fa-list-ol text-indigo-400"></i>
                  Live Steps
                  <span className="bg-indigo-600 text-white text-xs px-2 py-0.5 rounded-full">
                    {liveSteps.length}
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setShowStepsPanel(false)}
                className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white"
              >
                <i className="fas fa-times text-sm"></i>
              </button>
            </div>

            {/* Steps List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {liveSteps.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-slate-400 text-sm">No steps captured yet</p>
                </div>
              ) : (
                liveSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="bg-slate-700/50 rounded-xl overflow-hidden flex gap-3"
                  >
                    <div
                      className="relative w-28 h-20 flex-shrink-0 cursor-pointer"
                      onClick={() => {
                        setShowStepsPanel(false);
                        setPreviewImage(step.thumbnail);
                      }}
                    >
                      <img
                        src={step.thumbnail}
                        alt={`Step ${idx + 1}`}
                        className="w-full h-full object-cover rounded-l-xl"
                        crossOrigin="anonymous"
                      />
                      <div className="absolute inset-0 bg-black/0 active:bg-black/30 flex items-center justify-center rounded-l-xl">
                        <i className="fas fa-expand text-white text-sm opacity-0 active:opacity-100"></i>
                      </div>
                      <div className="absolute top-1 left-1 bg-indigo-600 w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                        {idx + 1}
                      </div>
                    </div>
                    <div className="flex-1 py-2 pr-3 flex flex-col justify-center">
                      <p className="text-white/50 text-[10px] font-mono">{step.timestamp}</p>
                      <p className="text-white text-sm font-medium line-clamp-1">
                        {step.status === 'capturing' ? 'Captured' : step.title}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Stats */}
            {isRecording && (
              <div className="p-4 border-t border-slate-700 grid grid-cols-2 gap-4 safe-area-bottom">
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{liveSteps.length}</p>
                  <p className="text-slate-400 text-[10px] uppercase">Steps</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{formatTime(recordingTime)}</p>
                  <p className="text-slate-400 text-[10px] uppercase">Duration</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveSOPGenerator;
