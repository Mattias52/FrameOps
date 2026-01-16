/**
 * YouTube Video Processing Service
 * Uses Railway backend for FFmpeg scene detection + HuggingFace VIT frame matching
 */

const RAILWAY_URL = import.meta.env.VITE_RAILWAY_URL || 'https://frameops-production.up.railway.app';

// Check if Railway is reachable
export const checkRailwayHealth = async (): Promise<boolean> => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${RAILWAY_URL}/health`, {
      signal: controller.signal,
      method: 'GET'
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
};

export interface ExtractedFrame {
  step_number: number;
  timestamp: string;
  timestampSeconds: number;
  imageBase64: string;
  size: number;
  transcription?: string;
}

export interface SceneDetectionResult {
  success: boolean;
  jobId: string;
  duration: number;
  sceneDetection: boolean;
  totalExtracted: number;
  frames: ExtractedFrame[];
}

export interface MatchedFrame {
  stepIndex: number;
  text: string;
  chosen: {
    candidateIndex: number;
    score: number;
    meta: {
      imageBase64: string;
      timestamp: string;
      timestampSeconds: number;
      transcription?: string;
    };
  } | null;
}

/**
 * Extract YouTube video ID from various URL formats
 */
export const extractYoutubeId = (url: string): string | null => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
};

/**
 * Fetch YouTube video metadata using noembed
 */
export const fetchYoutubeMetadata = async (videoId: string): Promise<{ title: string; author: string } | null> => {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    const data = await res.json();
    if (data.title) {
      return { title: data.title, author: data.author_name };
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Extract frames using Railway FFmpeg scene detection
 * This downloads the video server-side and extracts frames at actual scene changes
 */
export const extractFramesWithSceneDetection = async (
  youtubeUrl: string,
  onProgress?: (msg: string) => void,
  options?: {
    sceneThreshold?: number;
    maxFrames?: number;
    minFrames?: number;
  }
): Promise<SceneDetectionResult> => {
  const log = onProgress || console.log;

  log("Connecting to Railway frame extraction service...");
  log(`Railway URL: ${RAILWAY_URL}/extract-frames-scene-detect`);

  let response: Response;
  try {
    response = await fetch(`${RAILWAY_URL}/extract-frames-scene-detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        youtubeUrl,
        sceneThreshold: options?.sceneThreshold ?? 0.2,
        maxFrames: options?.maxFrames ?? 60,
        minFrames: options?.minFrames ?? 10,
        skipWhisper: true,
      }),
    });
  } catch (fetchError: any) {
    log(`Network error: ${fetchError.message}`);
    throw new Error(`Network error connecting to Railway: ${fetchError.message}`);
  }

  log(`Railway response status: ${response.status}`);

  if (!response.ok) {
    const errorText = await response.text();
    log(`Railway error response: ${errorText}`);
    throw new Error(`Railway scene detection failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  log(`Railway result success: ${result.success}, frames: ${result.frames?.length || 0}`);

  if (!result.success) {
    throw new Error(result.error || 'Scene detection failed');
  }

  log(`Extracted ${result.totalExtracted} frames via FFmpeg scene detection`);

  return result;
};

/**
 * Extract frames from uploaded video file using Railway FFmpeg scene detection
 * Sends the video file directly to Railway for server-side processing
 */
export const extractFramesFromUploadedVideo = async (
  videoFile: File,
  onProgress?: (msg: string) => void,
  options?: {
    sceneThreshold?: number;
    maxFrames?: number;
    minFrames?: number;
  }
): Promise<SceneDetectionResult> => {
  const log = onProgress || console.log;

  log("Uploading video to Railway for scene detection...");

  const formData = new FormData();
  formData.append('video', videoFile);
  formData.append('sceneThreshold', String(options?.sceneThreshold ?? 0.2));
  formData.append('maxFrames', String(options?.maxFrames ?? 60));
  formData.append('minFrames', String(options?.minFrames ?? 10));
  formData.append('skipWhisper', 'true');

  const response = await fetch(`${RAILWAY_URL}/extract-frames-scene-detect`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Railway scene detection failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Scene detection failed');
  }

  log(`Extracted ${result.totalExtracted} frames via Railway FFmpeg`);

  return result;
};

/**
 * Match extracted frames to step texts using HuggingFace VIT
 * This uses image classification + text embeddings to find the best frame for each step
 */
export const matchFramesToSteps = async (
  frames: ExtractedFrame[],
  stepTexts: string[],
  onProgress?: (msg: string) => void
): Promise<MatchedFrame[]> => {
  const log = onProgress || console.log;

  log(`Matching ${frames.length} frames to ${stepTexts.length} steps using VIT...`);

  const response = await fetch(`${RAILWAY_URL}/match-frames`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      frames: frames.map(f => ({
        imageBase64: f.imageBase64,
        timestamp: f.timestamp,
        timestampSeconds: f.timestampSeconds,
        transcription: f.transcription || '',
      })),
      steps: stepTexts,
      topK: 3,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Railway frame matching failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Frame matching failed');
  }

  log(`VIT matching complete: ${result.totalSteps} steps matched`);

  return result.result;
};

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Transcribe audio from uploaded video file using Whisper (OpenAI)
 */
export const transcribeUploadedVideoAudio = async (
  videoFile: File,
  onProgress?: (msg: string) => void
): Promise<{ transcript: string; segments: TranscriptSegment[]; source: string }> => {
  const log = onProgress || console.log;

  log("Transcribing video audio with Whisper...");

  try {
    const formData = new FormData();
    formData.append('video', videoFile);

    // Use Whisper endpoint (falls back to Gemini if no OpenAI key)
    const response = await fetch(`${RAILWAY_URL}/whisper-transcribe-video`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      log("Whisper transcription not available");
      return { transcript: '', segments: [], source: 'none' };
    }

    const result = await response.json();

    if (result.success && result.transcript) {
      log(`Whisper transcribed: ${result.transcript.length} chars, ${result.segments?.length || 0} segments (${result.source})`);
      return {
        transcript: result.transcript,
        segments: result.segments || [],
        source: result.source
      };
    }

    return { transcript: '', segments: [], source: result.source || 'none' };
  } catch (error) {
    log("Whisper transcription failed, continuing without");
    return { transcript: '', segments: [], source: 'none' };
  }
};

/**
 * Get YouTube transcript using Whisper (OpenAI) - tries subtitles first, then Whisper
 */
export const getYoutubeTranscript = async (
  youtubeUrl: string,
  onProgress?: (msg: string) => void
): Promise<{ transcript: string; segments: TranscriptSegment[]; source: string }> => {
  const log = onProgress || console.log;

  log("Fetching YouTube transcript with Whisper...");

  try {
    // Use Whisper endpoint (tries subtitles first, then Whisper for audio)
    const response = await fetch(`${RAILWAY_URL}/whisper-transcribe-youtube`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ youtubeUrl }),
    });

    if (!response.ok) {
      log("Transcript not available");
      return { transcript: '', segments: [], source: 'none' };
    }

    const result = await response.json();

    if (result.success && result.transcript) {
      log(`Transcript: ${result.transcript.length} chars, ${result.segments?.length || 0} segments (${result.source})`);
      return {
        transcript: result.transcript,
        segments: result.segments || [],
        source: result.source
      };
    }

    return { transcript: '', segments: [], source: 'none' };
  } catch (error) {
    log("Transcript fetch failed, continuing without");
    return { transcript: '', segments: [], source: 'none' };
  }
};

/**
 * Fetch YouTube thumbnail as base64 (fallback only)
 */
export const fetchYoutubeThumbnail = async (
  videoId: string,
  frameIndex: number | 'maxres'
): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) return "";

  const urlsToTry: string[] = [];
  if (frameIndex === 'maxres') {
    urlsToTry.push(
      `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      `https://img.youtube.com/vi/${videoId}/0.jpg`
    );
  } else {
    urlsToTry.push(`https://img.youtube.com/vi/${videoId}/${frameIndex}.jpg`);
  }

  for (const url of urlsToTry) {
    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      const res = await new Promise<string>((resolve, reject) => {
        img.onload = () => {
          if (img.naturalWidth <= 120) return reject();
          ctx.drawImage(img, 0, 0, 1280, 720);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = reject;
        img.src = url;
      });
      return res;
    } catch {
      continue;
    }
  }
  return "";
};

/**
 * Full YouTube processing pipeline:
 * 1. Scene detection with FFmpeg (Railway)
 * 2. VIT frame matching (Railway)
 * Returns frames ready for SOP generation
 */
export const processYoutubeVideo = async (
  youtubeUrl: string,
  stepTexts: string[],
  onProgress?: (msg: string) => void,
  options?: {
    sceneThreshold?: number;
    maxFrames?: number;
  }
): Promise<{
  frames: ExtractedFrame[];
  matchedFrames: MatchedFrame[];
  transcript: string;
}> => {
  const log = onProgress || console.log;

  // Step 1: Extract frames with scene detection
  log("Step 1/3: Running FFmpeg scene detection...");
  const sceneResult = await extractFramesWithSceneDetection(youtubeUrl, log, {
    sceneThreshold: options?.sceneThreshold ?? 0.2,
    maxFrames: options?.maxFrames ?? 60,
    minFrames: Math.max(10, stepTexts.length),
  });

  // Step 2: Get transcript (optional, for context)
  log("Step 2/3: Fetching transcript...");
  const { transcript } = await getYoutubeTranscript(youtubeUrl, log);

  // Step 3: Match frames to steps using VIT
  log("Step 3/3: Running VIT frame matching...");
  const matchedFrames = await matchFramesToSteps(sceneResult.frames, stepTexts, log);

  log(`Processing complete: ${sceneResult.frames.length} frames, ${matchedFrames.length} matches`);

  return {
    frames: sceneResult.frames,
    matchedFrames,
    transcript,
  };
};
