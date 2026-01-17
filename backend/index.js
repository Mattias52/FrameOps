const express = require('express');
const cors = require('cors');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');
const { GoogleGenAI, Type } = require('@google/genai');

// API documentation
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./config/swagger');

// API routes
const apiV1Routes = require('./routes/apiV1');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Add file upload middleware for uploaded videos (2GB max for Supabase Pro)
app.use(fileUpload({
  limits: {
    fileSize: 2 * 1024 * 1024 * 1024,  // 2GB for video files
    fieldSize: 100 * 1024 * 1024        // 100MB for form fields (ffmpegFrames with base64 images)
  },
  useTempFiles: true,
  tempFileDir: path.join(os.tmpdir(), 'uploads')
}));

// Serve simple web UI
app.use(express.static(path.join(__dirname, 'public')));

// API Documentation (Swagger UI)
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'FrameOps API Documentation'
}));

// Serve OpenAPI spec as JSON
app.get('/api/openapi.json', (req, res) => {
  res.json(swaggerSpec);
});

// Mount versioned API routes
app.use('/api/v1', apiV1Routes);

// API landing page
app.get('/api', (req, res) => {
  res.json({
    name: 'FrameOps API',
    version: '1.0.0',
    documentation: '/api/docs',
    openapi_spec: '/api/openapi.json',
    endpoints: {
      'POST /api/v1/generate-sop': 'Generate SOP from YouTube video',
      'POST /api/v1/analyze-frames': 'Generate SOP from uploaded images',
      'GET /api/v1/usage': 'Get your API usage statistics',
      'GET /api/v1/health': 'Health check (no auth required)'
    },
    authentication: 'Include X-API-Key header with your API key',
    get_api_key: 'https://frameops.com/dashboard'
  });
});

const PORT = process.env.PORT || 3000;
const TEMP_DIR = process.env.TEMP_DIR || path.join(os.tmpdir(), 'frames');

// Global error handlers to prevent server crashes
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  // Don't exit - try to keep server running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
  // Don't exit - try to keep server running
});

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Ensure upload temp directory exists
const UPLOAD_TEMP_DIR = path.join(os.tmpdir(), 'uploads');
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
}

// Embedding cache directory
const CACHE_DIR = path.join(TEMP_DIR, 'embed_cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

function hashString(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function cachePathFor(type, key) {
  const dir = path.join(CACHE_DIR, type);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${key}.json`);
}

function readCache(type, key) {
  const p = cachePathFor(type, key);
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
  }
  return null;
}

function writeCache(type, key, value) {
  const p = cachePathFor(type, key);
  try { fs.writeFileSync(p, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

// Check required external binaries at startup for clearer errors
function checkBinary(cmd, versionArg = '--version') {
  try {
    execSync(`${cmd} ${versionArg}`, { stdio: 'ignore' });
    console.log(`${cmd} found`);
    return true;
  } catch (e) {
    // Fallback: on Windows, try where.exe which may find scoop shims
    try {
      const out = execSync(`where.exe ${cmd}`).toString().trim();
      if (out) {
        console.log(`${cmd} found via where.exe -> ${out}`);
        return true;
      }
    } catch (e2) {
      // ignore
    }

    console.error(`${cmd} not found in PATH. Please install ${cmd} and ensure it's available in your PATH.`);
    return false;
  }
}

const hasYtDlp = checkBinary('yt-dlp');
// Check for ffmpeg in this order: FFMPEG_PATH env var, system ffmpeg, ffmpeg-static
let FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';
let hasFfmpeg = false;

// First try the configured path
try {
  execSync(`${FFMPEG_BIN} -version`, { stdio: 'ignore' });
  hasFfmpeg = true;
  console.log(`ffmpeg found at ${FFMPEG_BIN}`);
} catch (e) {
  hasFfmpeg = checkBinary('ffmpeg');
}
if (!hasFfmpeg) {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (ffmpegStatic) {
      FFMPEG_BIN = ffmpegStatic;
      hasFfmpeg = true;
      console.log('ffmpeg not in PATH — using ffmpeg-static:', FFMPEG_BIN);
    }
  } catch (e) {
    // ffmpeg-static not installed or not available
  }
}
if (!hasYtDlp || !hasFfmpeg) {
  console.error('Missing required binaries. See README for installation steps. Exiting.');
  process.exit(1);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '17.0.0' });
});

// Get transcript from YouTube video - tries subtitles first, then audio transcription
app.post('/get-transcript', async (req, res) => {
  const { youtubeUrl } = req.body;

  if (!youtubeUrl) {
    return res.status(400).json({ error: 'Missing youtubeUrl' });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const jobDir = path.join(TEMP_DIR, `transcript_${jobId}`);
  console.log(`[${jobId}] Fetching transcript for ${youtubeUrl}`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    // STEP 1: Try to get existing subtitles from YouTube
    const tempFile = path.join(jobDir, 'subs');
    let subtitleTranscript = '';

    try {
      execSync(
        `yt-dlp --skip-download --write-auto-subs --write-subs --sub-format "vtt/srt/best" --sub-langs "en.*,sv.*,de.*,fr.*,es.*,it.*,pt.*,nl.*,pl.*,ru.*,ja.*,ko.*,zh.*,no.*,da.*,fi.*" -o "${tempFile}" "${youtubeUrl}"`,
        { timeout: 30000, stdio: 'pipe' }
      );
    } catch (e) {
      console.log(`[${jobId}] No subtitles available from YouTube`);
    }

    // Check for subtitle files
    const subFiles = fs.readdirSync(jobDir).filter(f => f.endsWith('.vtt') || f.endsWith('.srt'));

    if (subFiles.length > 0) {
      console.log(`[${jobId}] Found subtitle files: ${subFiles.join(', ')}`);
      let selectedFile = subFiles[0];
      const englishFile = subFiles.find(f => f.includes('.en.') || f.includes('.en-'));
      if (englishFile) selectedFile = englishFile;

      const content = fs.readFileSync(path.join(jobDir, selectedFile), 'utf8');
      subtitleTranscript = content
        .replace(/WEBVTT/g, '')
        .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/^\d+$/gm, '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join(' ')
        .substring(0, 20000);

      console.log(`[${jobId}] Subtitle transcript: ${subtitleTranscript.length} chars`);
      cleanup(jobDir);
      return res.json({ success: true, transcript: subtitleTranscript, source: 'youtube-subtitles' });
    }

    // STEP 2: No subtitles - extract audio and transcribe with Gemini
    console.log(`[${jobId}] No subtitles found - extracting audio for AI transcription...`);

    try {
      // Download audio only - let yt-dlp handle the filename
      const audioTemplate = path.join(jobDir, 'audio.%(ext)s');
      execSync(
        `yt-dlp -x --audio-format mp3 --audio-quality 5 -o "${audioTemplate}" "${youtubeUrl}"`,
        { timeout: 120000 }
      );
      console.log(`[${jobId}] yt-dlp audio extraction completed`);
    } catch (dlErr) {
      console.error(`[${jobId}] Audio download failed:`, dlErr.message);
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'audio-download-failed' });
    }

    // Find the audio file (yt-dlp might create .mp3, .m4a, etc)
    const audioFiles = fs.readdirSync(jobDir).filter(f =>
      f.startsWith('audio.') && (f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.wav') || f.endsWith('.webm'))
    );
    console.log(`[${jobId}] Audio files found: ${audioFiles.join(', ') || 'none'}`);

    if (audioFiles.length === 0) {
      console.log(`[${jobId}] No audio file created`);
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'no-audio-file' });
    }

    const audioPath = path.join(jobDir, audioFiles[0]);
    const audioSize = fs.statSync(audioPath).size;
    console.log(`[${jobId}] Audio file: ${audioFiles[0]}, size: ${(audioSize / 1024 / 1024).toFixed(2)} MB`);

    if (audioSize < 1000) {
      console.log(`[${jobId}] Audio file too small`);
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'audio-too-small' });
    }

    // Convert to mp3 and trim if needed (Gemini works best with mp3)
    const mp3Path = path.join(jobDir, 'final.mp3');
    const maxDuration = audioSize > 15 * 1024 * 1024 ? 180 : 300; // 3 or 5 minutes max

    try {
      execSync(
        `${FFMPEG_BIN} -i "${audioPath}" -t ${maxDuration} -ar 16000 -ac 1 -b:a 64k "${mp3Path}" -y`,
        { timeout: 60000 }
      );
      console.log(`[${jobId}] Audio converted to mp3, trimmed to ${maxDuration}s`);
    } catch (ffmpegErr) {
      console.error(`[${jobId}] FFmpeg conversion failed:`, ffmpegErr.message);
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'ffmpeg-failed' });
    }

    // Read audio as base64
    const audioBuffer = fs.readFileSync(mp3Path);
    const audioBase64 = audioBuffer.toString('base64');
    const finalSize = audioBuffer.length;
    console.log(`[${jobId}] Final audio: ${(finalSize / 1024).toFixed(0)} KB, sending to Gemini...`);

    try {
      const response = await getGenAI().models.generateContent({
        model: "gemini-2.0-flash",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'audio/mpeg',
                data: audioBase64
              }
            },
            {
              text: `Listen to this audio and transcribe ALL spoken words accurately.

IMPORTANT:
- This is from an instructional/tutorial video
- Transcribe EVERYTHING that is spoken
- Keep the original language (do not translate)
- Output ONLY the transcription, nothing else
- If there is background music, ignore it and focus on speech
- If you hear speech, you MUST transcribe it

Begin transcription:`
            }
          ]
        }
      });

      const transcription = response.text?.trim() || '';
      console.log(`[${jobId}] Gemini transcription result: ${transcription.length} chars`);
      if (transcription.length > 0) {
        console.log(`[${jobId}] First 200 chars: ${transcription.substring(0, 200)}`);
      }

      cleanup(jobDir);
      return res.json({
        success: true,
        transcript: transcription.substring(0, 20000),
        source: 'gemini-audio'
      });

    } catch (geminiErr) {
      console.error(`[${jobId}] Gemini transcription error:`, geminiErr.message);
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'gemini-error: ' + geminiErr.message });
    }

  } catch (error) {
    console.error(`[${jobId}] Transcript error:`, error.message);
    cleanup(jobDir);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Match frames to step texts using VIT image classification + text embeddings + monotonic DP
// Strategy: Image → VIT labels → Text embeddings → Compare with step text embeddings
app.post('/match-frames', async (req, res) => {
  const { frames, steps, topK = 3 } = req.body;
  const HF_API = process.env.HF_API_TOKEN;
  const VIT_MODEL = 'google/vit-base-patch16-224';
  const TEXT_MODEL = 'intfloat/multilingual-e5-large';

  if (!frames || !Array.isArray(frames) || !steps || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'Missing required fields: frames (from /extract-frames) and steps (array of text)' });
  }

  if (!HF_API) {
    return res.status(500).json({ error: 'HF_API_TOKEN is required in env to compute embeddings' });
  }

  try {
    // Flatten candidates and keep metadata (including transcription!)
    const candidates = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i];
      // CRITICAL: Include ALL frame properties (timestamp, transcription, etc.) in meta
      // When no candidates array, create one with ALL frame properties, not just imageBase64
      const cands = f.candidates || (f.imageBase64 ? [{
        imageBase64: f.imageBase64,
        timestamp: f.timestamp,
        transcription: f.transcription || '',
        timestampSeconds: f.timestampSeconds,
        size: f.size
      }] : []);
      for (let j = 0; j < cands.length; j++) {
        candidates.push({ stepIndex: i, candidateIndex: j, imageBase64: cands[j].imageBase64, meta: cands[j] });
      }
    }

    if (candidates.length === 0) return res.status(400).json({ error: 'No candidate images found in frames payload' });

    // Log transcription stats
    const withTranscription = candidates.filter(c => c.meta.transcription && c.meta.transcription.length > 0);
    console.log(`Processing ${candidates.length} candidates for ${steps.length} steps (${withTranscription.length} have transcription)`);

    // Step 1: Get VIT classification labels for each image
    const imageDescriptions = [];
    for (let k = 0; k < candidates.length; k++) {
      const b64 = candidates[k].imageBase64;
      const labels = await hfImageClassification(b64, VIT_MODEL, HF_API);
      // Combine top labels into a description string
      const desc = labels.slice(0, 5).map(l => l.label).join(', ');
      imageDescriptions.push(desc);
      console.log(`Image ${k}: ${desc}`);
    }

    // Step 2: Get text embeddings for all texts (steps + image descriptions)
    const allTexts = [...steps, ...imageDescriptions];
    const allEmbeddings = await hfTextEmbeddings(allTexts, TEXT_MODEL, HF_API);

    const stepEmb = allEmbeddings.slice(0, steps.length);
    const imageEmb = allEmbeddings.slice(steps.length);

    // Step 3: Build similarity matrix: steps x candidates
    const S = steps.length, C = candidates.length;
    const sim = Array.from({ length: S }, () => Array(C).fill(-Infinity));
    for (let i = 0; i < S; i++) {
      for (let j = 0; j < C; j++) {
        sim[i][j] = cosine(stepEmb[i], imageEmb[j]);
      }
    }

    // Step 4: Assign with monotonic DP
    const assignment = matchMonotonicDPWithPositions(sim, candidates.map(c => c.stepIndex * 100 + c.candidateIndex));

    // Build response per step with chosen candidate and topK list
    const result = steps.map((t, i) => ({ stepIndex: i, text: t, chosen: null, top: [] }));

    for (let i = 0; i < S; i++) {
      const scores = [];
      for (let j = 0; j < C; j++) scores.push({ candidate: candidates[j], score: sim[i][j], index: j });
      scores.sort((a, b) => b.score - a.score);
      result[i].top = scores.slice(0, topK).map(s => ({
        score: s.score,
        candidateIndex: s.index,
        meta: { ...s.candidate.meta, stepIndex: s.candidate.stepIndex, localCandidateIndex: s.candidate.candidateIndex }
      }));
      const chosenIdx = assignment[i];
      if (typeof chosenIdx === 'number' && chosenIdx >= 0) {
        result[i].chosen = {
          candidateIndex: chosenIdx,
          score: sim[i][chosenIdx],
          meta: {
            ...candidates[chosenIdx].meta,
            stepIndex: candidates[chosenIdx].stepIndex,
            localCandidateIndex: candidates[chosenIdx].candidateIndex
          }
        };
      }
    }

    res.json({ success: true, totalSteps: S, totalCandidates: C, result });
  } catch (e) {
    console.error('match-frames error:', e.message || e);
    res.status(500).json({ success: false, error: e.message || String(e) });
  }
});

// -- Embedding helpers and DP --
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-12);
}

// Image classification using VIT - returns array of {label, score}
async function hfImageClassification(b64, model, apiKey) {
  const fetch = require('node-fetch');
  const key = hashString(b64);
  const cached = readCache('imgclass', key);
  if (cached) return cached;

  const raw = b64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  const buffer = Buffer.from(raw, 'base64');

  const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'image/jpeg' },
    body: buffer
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`HF image classification error ${res.status}: ${errText}`);
  }

  const json = await res.json();
  // Returns array of {label, score}
  try { writeCache('imgclass', key, json); } catch (e) { /* ignore */ }
  return json;
}

async function hfTextEmbeddings(texts, model, apiKey) {
  const fetch = require('node-fetch');
  // texts: array of strings. Use per-text caching to avoid recomputing.
  const results = new Array(texts.length);
  const toCompute = [];
  const computeIdx = [];

  for (let i = 0; i < texts.length; i++) {
    const key = hashString(texts[i]);
    const cached = readCache('text', key);
    if (cached) results[i] = cached;
    else { toCompute.push(texts[i]); computeIdx.push({ i, key }); }
  }

  if (toCompute.length > 0) {
    const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: toCompute })
    });
    if (!res.ok) throw new Error(`HF text embed error ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json) || !Array.isArray(json[0])) throw new Error('Unexpected HF text response');
    // save each computed embedding
    for (let k = 0; k < json.length; k++) {
      const { i, key } = computeIdx[k];
      results[i] = json[k];
      try { writeCache('text', key, json[k]); } catch (e) { /* ignore */ }
    }
  }

  return results;
}

async function hfImageEmbeddingFromBase64(b64, model, apiKey) {
  const fetch = require('node-fetch');
  const key = hashString(b64);
  const cached = readCache('image', key);
  if (cached) return cached;

  const raw = b64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
  const buffer = Buffer.from(raw, 'base64');
  const res = await fetch(`https://router.huggingface.co/hf-inference/models/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/octet-stream' },
    body: buffer
  });
  if (!res.ok) throw new Error(`HF image embed error ${res.status}`);
  const json = await res.json();
  let emb = null;
  if (Array.isArray(json) && Array.isArray(json[0])) emb = json[0];
  else if (Array.isArray(json)) emb = json;
  else throw new Error('Unexpected HF image response');
  try { writeCache('image', key, emb); } catch (e) { /* ignore */ }
  return emb;
}

function matchMonotonicDPWithPositions(sim, positions, jumpPenalty = 0.02) {
  // sim: S x C matrix. positions: length C, increasing mostly.
  // FIXED: Use strictly less than (<) to enforce different candidates per step
  const S = sim.length; if (S === 0) return [];
  const C = sim[0].length; if (C === 0) return Array(S).fill(-1);

  const dp = Array.from({ length: S }, () => Array(C).fill(-Infinity));
  const back = Array.from({ length: S }, () => Array(C).fill(-1));

  for (let j = 0; j < C; j++) dp[0][j] = sim[0][j];

  for (let i = 1; i < S; i++) {
    for (let j = 0; j < C; j++) {
      let best = -Infinity, bi = -1;
      for (let k = 0; k < C; k++) {
        // FIXED: Use < instead of <= to force strictly increasing positions (different candidates)
        if (positions[k] < positions[j]) {
          const penalty = jumpPenalty * Math.abs(positions[j] - positions[k]) / 100.0;
          const cand = dp[i-1][k] + sim[i][j] - penalty;
          if (cand > best) { best = cand; bi = k; }
        }
      }
      dp[i][j] = best;
      back[i][j] = bi;
    }
  }

  // choose best end
  let bestEnd = 0, bestScore = dp[S-1][0];
  for (let j = 1; j < C; j++) if (dp[S-1][j] > bestScore) { bestScore = dp[S-1][j]; bestEnd = j; }

  const assignment = Array(S).fill(-1);
  let cur = bestEnd;
  for (let i = S - 1; i >= 0; i--) {
    assignment[i] = cur;
    cur = back[i][cur];
    if (cur === -1 && i > 0) cur = 0;
  }
  return assignment;
}

// Extract frames from YouTube video via STREAMING
app.post('/extract-frames', async (req, res) => {
  const { youtubeUrl, timestamps, videoId } = req.body;

  if (!youtubeUrl || !timestamps || !Array.isArray(timestamps)) {
    return res.status(400).json({
      error: 'Missing required fields: youtubeUrl and timestamps (array)'
    });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const jobDir = path.join(TEMP_DIR, jobId);

  console.log(`[${jobId}] STREAMING candidate extraction for ${youtubeUrl}`);
  console.log(`[${jobId}] Timestamps: ${timestamps.join(', ')}`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    // Get direct stream URL
    const streamUrl = await getStreamUrl(youtubeUrl);
    if (!streamUrl) throw new Error('Could not retrieve direct stream URL');

    console.log(`[${jobId}] Stream URL acquired, extracting candidates...`);

    const frames = [];
    const SEARCH_WINDOW = 15; // ±15 seconds around each timestamp

    for (let i = 0; i < timestamps.length; i++) {
      const timestamp = timestamps[i];
      const seconds = parseTimestamp(timestamp);

      const startTime = Math.max(seconds - SEARCH_WINDOW, 0);
      const sceneFramesDir = path.join(jobDir, `scene_${i + 1}`);
      fs.mkdirSync(sceneFramesDir, { recursive: true });

      console.log(`[${jobId}] Step ${i + 1}: extracting candidates around ${formatTimestamp(seconds)}`);

      try {
        // Extract 5 frames at 7-second intervals around the timestamp
        for (let c = 0; c < 5; c++) {
          const offset = startTime + (c * 7);
          const framePath = path.join(sceneFramesDir, `frame_${c}.jpg`);

          execSync(
            `${FFMPEG_BIN} -hide_banner -loglevel error -nostats -ss ${offset} -i "${streamUrl}" -vframes 1 -vf "format=yuv420p" -pix_fmt yuv420p -q:v 2 "${framePath}" -y`,
            { timeout: 15000 }
          );
        }

        const sceneFiles = fs.readdirSync(sceneFramesDir)
          .filter(f => f.endsWith('.jpg'))
          .sort();

        const candidates = [];
        for (let c = 0; c < sceneFiles.length; c++) {
          const framePath = path.join(sceneFramesDir, sceneFiles[c]);
          const frameData = fs.readFileSync(framePath);
          candidates.push({
            index: c,
            imageBase64: `data:image/jpeg;base64,${frameData.toString('base64')}`,
            size: frameData.length
          });
        }

        if (candidates.length > 0) {
          frames.push({
            step_number: i + 1,
            timestamp: timestamp,
            candidates: candidates,
            imageBase64: candidates[0].imageBase64,
            size: candidates[0].size
          });
        }

      } catch (frameError) {
        console.error(`[${jobId}] Step ${i + 1} failed:`, frameError.message);
      }
    }

    cleanup(jobDir);
    console.log(`[${jobId}] Done: ${frames.length} steps processed via streaming`);

    res.json({
      success: true,
      jobId,
      streaming: true,
      totalRequested: timestamps.length,
      totalExtracted: frames.length,
      frames
    });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    cleanup(jobDir);
    res.status(500).json({ success: false, error: error.message, jobId });
  }
});

// Extract frames at regular intervals via STREAMING
app.post('/extract-frames-interval', async (req, res) => {
  const { youtubeUrl, numFrames = 10, startTime = 0, endTime } = req.body;

  if (!youtubeUrl) {
    return res.status(400).json({ error: 'Missing youtubeUrl' });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const jobDir = path.join(TEMP_DIR, jobId);

  console.log(`[${jobId}] STREAMING interval extraction for ${youtubeUrl}`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    // Get direct stream URL
    const streamUrl = await getStreamUrl(youtubeUrl);
    if (!streamUrl) throw new Error('Could not retrieve direct stream URL');

    // Get duration if not provided
    let duration = endTime ? (endTime - startTime) : 0;
    if (!duration) {
      try {
        const durationOutput = execSync(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${streamUrl}"`
        ).toString().trim();
        const totalDuration = parseFloat(durationOutput);
        duration = (endTime || totalDuration) - startTime;
      } catch (e) {
        duration = 600; // Default 10 mins
      }
    }

    const interval = duration / (numFrames + 1);
    console.log(`[${jobId}] Extracting ${numFrames} frames at ${interval.toFixed(1)}s intervals`);

    const frames = [];
    for (let i = 0; i < numFrames; i++) {
      const seconds = startTime + (i + 1) * interval;
      const framePath = path.join(jobDir, `frame_${i + 1}.jpg`);

      try {
        execSync(
          `${FFMPEG_BIN} -hide_banner -loglevel error -nostats -ss ${seconds} -i "${streamUrl}" -vframes 1 -vf "format=yuv420p" -pix_fmt yuv420p -q:v 2 "${framePath}" -y`,
          { timeout: 15000 }
        );

        if (fs.existsSync(framePath)) {
          const frameData = fs.readFileSync(framePath);
          frames.push({
            index: i,
            timestamp: formatTimestamp(seconds),
            timestampSeconds: seconds,
            imageBase64: `data:image/jpeg;base64,${frameData.toString('base64')}`,
            size: frameData.length
          });
        }
      } catch (e) {
        console.error(`[${jobId}] Interval frame ${i} failed:`, e.message);
      }
    }

    cleanup(jobDir);
    res.json({ success: true, jobId, streaming: true, frames });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    cleanup(jobDir);
    res.status(500).json({ success: false, error: error.message, jobId });
  }
});

// Add this NEW endpoint to your Railway index.js
// Simple frame extraction at exact timestamps - no scene detection needed

app.post('/extract-frames-at-timestamps', async (req, res) => {
  const { youtubeUrl, timestamps } = req.body;

  if (!youtubeUrl || !timestamps || !Array.isArray(timestamps)) {
    return res.status(400).json({
      error: 'Missing required fields: youtubeUrl and timestamps (array of seconds)'
    });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const jobDir = path.join(TEMP_DIR, jobId);

  console.log(`[${jobId}] STREAMING FRAME EXTRACTION from ${youtubeUrl}`);
  console.log(`[${jobId}] Timestamps: ${timestamps.map(t => formatTimestamp(t)).join(', ')}`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    // Get direct stream URL
    const streamUrl = await getStreamUrl(youtubeUrl);

    if (!streamUrl) {
      throw new Error('Could not retrieve direct stream URL from YouTube');
    }

    console.log(`[${jobId}] Stream URL acquired, extracting ${timestamps.length} frames...`);

    const frames = [];

    for (let i = 0; i < timestamps.length; i++) {
      const seconds = timestamps[i];
      const framePath = path.join(jobDir, `frame_${i + 1}.jpg`);

      try {
        // Extract EXACT frame directly from the stream URL
        // Using -ss BEFORE -i for fast seeking
        execSync(
          `${FFMPEG_BIN} -hide_banner -loglevel error -nostats -ss ${seconds} -i "${streamUrl}" -vframes 1 -vf "format=yuv420p" -pix_fmt yuv420p -q:v 2 "${framePath}" -y`,
          { timeout: 15000 }
        );

        if (fs.existsSync(framePath)) {
          const frameData = fs.readFileSync(framePath);
          frames.push({
            step_number: i + 1,
            timestamp: formatTimestamp(seconds),
            timestampSeconds: seconds,
            imageBase64: `data:image/jpeg;base64,${frameData.toString('base64')}`,
            size: frameData.length
          });

          if ((i + 1) % 5 === 0 || i === 0) console.log(`[${jobId}] Extracted frame ${i + 1}/${timestamps.length}`);
        }
      } catch (frameError) {
        console.error(`[${jobId}] ✗ Frame ${i + 1} failed at ${seconds}s:`, frameError.message);
      }
    }

    cleanup(jobDir);

    console.log(`[${jobId}] Done: ${frames.length}/${timestamps.length} frames extracted via streaming`);

    res.json({
      success: true,
      jobId,
      streaming: true,
      totalRequested: timestamps.length,
      totalExtracted: frames.length,
      frames
    });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    cleanup(jobDir);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SCENE DETECTION WITH ACTUAL TIMESTAMPS
// Parses pts_time from FFmpeg to get real timestamps
// SUPPORTS: YouTube URLs AND File Uploads
// ============================================
app.post('/extract-frames-scene-detect', async (req, res) => {
  const {
    youtubeUrl,
    startTime = 0,
    endTime,
    sceneThreshold = 0.2,
    maxFrames = 60,
    minFrames = 4,
    skipWhisper = false
  } = req.body;

  // Check for file upload
  const uploadedFile = req.files?.video || req.files?.file;

  if (!youtubeUrl && !uploadedFile) {
    return res.status(400).json({ error: 'Missing youtubeUrl or video file upload' });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const jobDir = path.join(TEMP_DIR, jobId);

  const isUpload = !!uploadedFile;
  console.log(`[${jobId}] SCENE DETECTION - ${isUpload ? 'FILE UPLOAD' : 'YOUTUBE'}: ${isUpload ? uploadedFile.name : youtubeUrl}`);
  console.log(`[${jobId}] Threshold: ${sceneThreshold}, Max: ${maxFrames}, Min: ${minFrames}`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    // Get video path - either from upload or download from YouTube
    let videoPath = path.join(jobDir, 'video.mp4');

    if (isUpload) {
      // Move uploaded file to job directory
      await uploadedFile.mv(videoPath);
      console.log(`[${jobId}] Uploaded file saved: ${uploadedFile.name} (${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB)`);
    } else {
      // Download from YouTube - FIXED: Force video download, not just audio
      console.log(`[${jobId}] Downloading video...`);

      try {
        const dlOutput = execSync(
          `yt-dlp --no-warnings --no-check-certificates -f "bv*[height<=720][ext=mp4]+ba[ext=m4a]/bv*[height<=720]+ba/b[height<=720]/b" --merge-output-format mp4 --user-agent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" --extractor-retries 5 --retries 3 -o "${videoPath}" "${youtubeUrl}"`,
          { timeout: 180000, encoding: 'utf8' }
        );
        console.log(`[${jobId}] yt-dlp finished. Output: ${dlOutput.split('\n').filter(l => l.trim()).pop()}`);
      } catch (dlErr) {
        console.error(`[${jobId}] yt-dlp failed:`, dlErr.message);
        throw dlErr;
      }
    }

    if (!fs.existsSync(videoPath) || fs.statSync(videoPath).size === 0) {
      throw new Error(`Video file not found or empty after ${isUpload ? 'upload' : 'download'}.`);
    }

    // Inspect file with ffprobe
    try {
      const probe = execSync(`ffprobe -v error -show_streams -of json "${videoPath}"`).toString();
      const probeData = JSON.parse(probe);
      const hasVideo = probeData.streams?.some(s => s.codec_type === 'video');
      console.log(`[${jobId}] ffprobe: ${probeData.streams?.length || 0} streams found. Has video: ${hasVideo}`);

      if (!hasVideo) {
        throw new Error('Downloaded file has no video stream. This may be an audio-only download.');
      }
    } catch (probeErr) {
      console.error(`[${jobId}] ffprobe failed:`, probeErr.message);
      if (probeErr.message.includes('no video stream')) {
        throw probeErr;
      }
    }

    // Get video duration
    const durationOutput = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    ).toString().trim();

    const duration = parseFloat(durationOutput);
    const effectiveStart = startTime || 0;
    const effectiveEnd = endTime || duration;

    console.log(`[${jobId}] Video duration: ${duration}s, analyzing ${effectiveStart}s - ${effectiveEnd}s`);

    // ============================================
    // STEP 1: Find ACTUAL scene change timestamps
    // ============================================
    console.log(`[${jobId}] Running scene detection with threshold ${sceneThreshold}...`);

    let sceneTimestamps = [];

    // Run FFmpeg scene detection and capture pts_time from showinfo output
    try {
      // Use -loglevel info to ensure showinfo prints, but filter out the swscaler warning
      const sceneOutput = execSync(
        `${FFMPEG_BIN} -hide_banner -loglevel info -nostats -i "${videoPath}" -ss ${effectiveStart} -to ${effectiveEnd} -vf "format=yuv420p,select='gt(scene,${sceneThreshold})',showinfo" -f null - 2>&1 | grep -v "deprecated pixel format" | grep -E "pts_time|Parsed_showinfo"`,
        { timeout: 120000, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
      );

      // Parse pts_time from showinfo output
      // Format: [Parsed_showinfo_1 @ 0x...] n:0 pts:12345 pts_time:1.234567 ...
      const ptsMatches = sceneOutput.match(/pts_time:[\d.]+/g) || [];
      sceneTimestamps = ptsMatches
        .map(match => {
          const ts = parseFloat(match.split(':')[1]);
          return ts + effectiveStart; // Add offset since we used -ss
        })
        .filter(ts => !isNaN(ts) && ts >= effectiveStart && ts <= effectiveEnd);

      console.log(`[${jobId}] Found ${sceneTimestamps.length} scene timestamps from FFmpeg`);

      if (sceneTimestamps.length > 0) {
        console.log(`[${jobId}] First 5 timestamps: ${sceneTimestamps.slice(0, 5).map(t => t.toFixed(2)).join('s, ')}s`);
      }
    } catch (e) {
      console.log(`[${jobId}] Scene detection failed: ${e.message}`);
    }

    // If too few scenes, try lower threshold
    if (sceneTimestamps.length < minFrames) {
      const lowerThreshold = sceneThreshold * 0.5;
      console.log(`[${jobId}] Too few scenes (${sceneTimestamps.length}), retrying with threshold ${lowerThreshold}`);

      try {
        const sceneOutput = execSync(
          `${FFMPEG_BIN} -hide_banner -loglevel info -nostats -i "${videoPath}" -ss ${effectiveStart} -to ${effectiveEnd} -vf "format=yuv420p,select='gt(scene,${lowerThreshold})',showinfo" -f null - 2>&1 | grep -v "deprecated pixel format" | grep -E "pts_time"`,
          { timeout: 120000, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }
        );

        const ptsMatches = sceneOutput.match(/pts_time:[\d.]+/g) || [];
        sceneTimestamps = ptsMatches
          .map(match => parseFloat(match.split(':')[1]) + effectiveStart)
          .filter(ts => !isNaN(ts) && ts >= effectiveStart && ts <= effectiveEnd);

        console.log(`[${jobId}] After retry: ${sceneTimestamps.length} timestamps`);
      } catch (e) {
        console.log(`[${jobId}] Retry failed: ${e.message}`);
      }
    }

    // Fallback: evenly distributed timestamps
    if (sceneTimestamps.length < minFrames) {
      console.log(`[${jobId}] Falling back to interval extraction`);
      sceneTimestamps = [];
      const interval = (effectiveEnd - effectiveStart) / minFrames;
      for (let i = 0; i < minFrames; i++) {
        sceneTimestamps.push(effectiveStart + (i * interval));
      }
    }

    // Limit to maxFrames (select evenly distributed)
    if (sceneTimestamps.length > maxFrames) {
      console.log(`[${jobId}] Limiting from ${sceneTimestamps.length} to ${maxFrames} frames`);
      const step = sceneTimestamps.length / maxFrames;
      const selected = [];
      for (let i = 0; i < maxFrames; i++) {
        selected.push(sceneTimestamps[Math.floor(i * step)]);
      }
      sceneTimestamps = selected;
    }

    // Sort timestamps
    sceneTimestamps.sort((a, b) => a - b);

    // Remove duplicates (within 0.5s of each other)
    const uniqueTimestamps = [];
    for (const ts of sceneTimestamps) {
      if (uniqueTimestamps.length === 0 || ts - uniqueTimestamps[uniqueTimestamps.length - 1] > 0.5) {
        uniqueTimestamps.push(ts);
      }
    }
    sceneTimestamps = uniqueTimestamps;

    console.log(`[${jobId}] Final ${sceneTimestamps.length} timestamps: ${sceneTimestamps.map(t => formatTimestamp(t)).join(', ')}`);

    // ============================================
    // STEP 2: Extract frames at EXACT timestamps
    // ============================================
    const sceneDir = path.join(jobDir, 'scenes');
    fs.mkdirSync(sceneDir, { recursive: true });

    console.log(`[${jobId}] Extracting ${sceneTimestamps.length} frames at exact timestamps...`);

    const frames = [];

    for (let i = 0; i < sceneTimestamps.length; i++) {
      const timestamp = sceneTimestamps[i];
      const framePath = path.join(sceneDir, `scene_${String(i + 1).padStart(4, '0')}.jpg`);

      try {
        // Extract exact frame at this timestamp
        execSync(
          `${FFMPEG_BIN} -hide_banner -loglevel error -nostats -ss ${timestamp} -i "${videoPath}" -vframes 1 -vf "format=yuv420p" -pix_fmt yuv420p -q:v 2 "${framePath}" -y`,
          { timeout: 10000 }
        );

        if (fs.existsSync(framePath)) {
          const frameData = fs.readFileSync(framePath);

          frames.push({
            step_number: i + 1,
            timestamp: formatTimestamp(timestamp),
            timestampSeconds: timestamp,
            imageBase64: `data:image/jpeg;base64,${frameData.toString('base64')}`,
            size: frameData.length,
            transcription: ''
          });

          // Reduced logging: only log every 10th frame to avoid Railway rate limit
          if ((i + 1) % 10 === 0 || i === 0) console.log(`[${jobId}] Extracted frame ${i + 1}/${sceneTimestamps.length}`);
        }
      } catch (e) {
        console.log(`[${jobId}] Failed to extract frame at ${timestamp}s: ${e.message}`);
      }
    }

    cleanup(jobDir);

    console.log(`[${jobId}] Returning ${frames.length} frames with ACTUAL timestamps`);

    res.json({
      success: true,
      jobId,
      duration,
      sceneDetection: true,
      sceneThreshold,
      totalExtracted: frames.length,
      transcribedCount: 0,
      whisperSkipped: true,
      source: isUpload ? 'upload' : 'youtube',
      frames
    });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    cleanup(jobDir);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper: Get direct stream URL using yt-dlp - FIXED: Force video stream
async function getStreamUrl(youtubeUrl) {
  try {
    console.log(`Getting stream URL for ${youtubeUrl}...`);
    const url = execSync(
      `yt-dlp --no-warnings --no-check-certificates -g -f "bv*[height<=720][ext=mp4]/bv*[height<=720]/b[height<=720]/b" "${youtubeUrl}"`,
      { timeout: 30000, encoding: 'utf8' }
    ).trim();
    return url.split('\n')[0]; // Take first URL (video) if multiple returned
  } catch (e) {
    console.error('Failed to get stream URL:', e.message);
    return null;
  }
}

// Helper: Parse timestamp "MM:SS" or "HH:MM:SS" to seconds
function parseTimestamp(timestamp) {
  if (typeof timestamp === 'number') return timestamp;

  const parts = timestamp.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return 0;
}

// Helper: Format seconds to "MM:SS"
function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Helper: Cleanup job directory
function cleanup(dir) {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error('Cleanup error:', e.message);
  }
}

// ============================================
// GEMINI SOP ANALYSIS ENDPOINT
// Moved from frontend to keep API key server-side
// ============================================
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

let _genai = null;
function getGenAI() {
  if (!_genai) {
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured in environment');
    }
    _genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }
  return _genai;
}

// ============================================
// NATIVE VIDEO SOP ANALYSIS (Gemini File API)
// Uses Gemini's native video understanding for audio+video context
// FFmpeg frames are provided separately and matched by timestamp
// ============================================
app.post('/analyze-video-native', async (req, res) => {
  if (!req.files || !req.files.video) {
    return res.status(400).json({ error: 'No video file provided' });
  }

  const videoFile = req.files.video;
  const title = req.body.title || 'Procedure';
  // FFmpeg frames with timestamps (provided by frontend)
  const ffmpegFrames = req.body.ffmpegFrames ? JSON.parse(req.body.ffmpegFrames) : [];
  const jobId = crypto.randomBytes(8).toString('hex');

  console.log(`[${jobId}] Native video analysis: "${title}" (${(videoFile.size / 1024 / 1024).toFixed(1)}MB)`);
  console.log(`[${jobId}] FFmpeg frames provided: ${ffmpegFrames.length}`);

  try {
    const fetch = require('node-fetch');
    const genai = getGenAI();

    // Step 1: Upload video to Gemini File API using REST
    console.log(`[${jobId}] Uploading video to Gemini File API...`);

    const videoData = fs.readFileSync(videoFile.tempFilePath);
    const mimeType = videoFile.mimetype || 'video/mp4';
    const numBytes = videoData.length;

    // Start resumable upload
    const startResponse = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
      method: 'POST',
      headers: {
        'x-goog-api-key': GEMINI_API_KEY,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(numBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file: { display_name: title } })
    });

    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      throw new Error('Failed to get upload URL from Gemini');
    }

    console.log(`[${jobId}] Got upload URL, uploading ${(numBytes / 1024 / 1024).toFixed(1)}MB...`);

    // Upload video data
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(numBytes),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: videoData
    });

    const uploadResult = await uploadResponse.json();
    if (!uploadResult.file || !uploadResult.file.uri) {
      throw new Error('Failed to upload video to Gemini: ' + JSON.stringify(uploadResult));
    }

    let fileUri = uploadResult.file.uri;
    let fileName = uploadResult.file.name;
    let fileState = uploadResult.file.state;

    console.log(`[${jobId}] File uploaded: ${fileName}, state: ${fileState}`);

    // Step 2: Wait for video processing
    while (fileState === 'PROCESSING') {
      console.log(`[${jobId}] Waiting for video processing...`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`);
      const statusResult = await statusResponse.json();
      fileState = statusResult.state;
      fileUri = statusResult.uri || fileUri;
    }

    if (fileState === 'FAILED') {
      throw new Error('Video processing failed');
    }

    console.log(`[${jobId}] Video ready: ${fileUri}`);

    // Build frame list for Gemini to select from
    const frameListForPrompt = ffmpegFrames.map((f, idx) =>
      `Frame ${idx}: timestamp ${f.timestamp}`
    ).join('\n');

    console.log(`[${jobId}] Sending ${ffmpegFrames.length} frames for Gemini to select from`);

    // Step 3: Generate SOP using native video understanding + frame selection
    const prompt = `
      You are an expert technical writer creating a Standard Operating Procedure (SOP).

      WATCH THIS ENTIRE VIDEO carefully. Pay attention to BOTH:
      - AUDIO: What the presenter/narrator is SAYING - use their EXACT words!
      - VISUAL: What actions are being performed on screen

      Create a detailed SOP for: "${title}"

      CRITICAL REQUIREMENTS:
      1. Use the presenter's EXACT words and terminology from the audio
      2. Include ALL steps mentioned or shown, even brief ones like:
         - "Remove the screw with a Phillips head screwdriver"
         - "Lift the bracket"
         - "Set aside the component"
      3. Note ALL tools or equipment mentioned (screwdrivers, wipes, alcohol, etc.)
      4. Provide accurate timestamps (MM:SS) for when each step STARTS
      5. Do NOT summarize or skip steps - document EVERY action
      6. If the presenter says "be careful" or gives a warning, include it
      7. ALWAYS write in ENGLISH

      IMPORTANT - FRAME SELECTION:
      I have extracted the following frames from the video. For EACH step, you MUST select
      the frame that BEST shows the action being described. Choose the frame where the
      action is VISIBLE - not where it's being discussed, but where it's actually SHOWN.

      Available frames:
      ${frameListForPrompt}

      For each step provide:
      - timestamp: When this step starts (MM:SS format, e.g., "00:45")
      - title: Short action title
      - description: Detailed instructions using presenter's actual words
      - frameIndex: The frame number (0-${ffmpegFrames.length - 1}) that BEST shows this action visually
      - safetyWarnings: Array of warnings mentioned (or empty)
      - toolsRequired: Array of tools needed for this step (or empty)
    `;

    console.log(`[${jobId}] Generating SOP with native video understanding...`);

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          { fileData: { fileUri: fileUri, mimeType: mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            ppeRequirements: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            materialsRequired: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  frameIndex: { type: Type.NUMBER },
                  safetyWarnings: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  toolsRequired: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["id", "timestamp", "title", "description", "frameIndex"]
              }
            }
          },
          required: ["title", "description", "steps", "ppeRequirements", "materialsRequired"]
        }
      }
    });

    const resultText = response.text;
    const result = JSON.parse(resultText);

    console.log(`[${jobId}] Gemini generated ${result.steps?.length || 0} steps`);
    // Log first 3 steps with frame selection
    result.steps?.slice(0, 3).forEach((s, i) => {
      console.log(`[${jobId}] Step ${i+1}: [${s.timestamp}] ${s.title} → Frame ${s.frameIndex}`);
    });

    // Step 4: Use Gemini's frame selection (no more timestamp matching!)
    const stepsWithFrames = result.steps.map((step, idx) => {
      if (ffmpegFrames.length === 0) {
        return { ...step, id: `step-${idx + 1}` };
      }

      // Use Gemini's selected frame, with bounds checking
      const frameIdx = Math.max(0, Math.min(step.frameIndex || 0, ffmpegFrames.length - 1));
      const selectedFrame = ffmpegFrames[frameIdx];

      console.log(`[${jobId}] Step ${idx + 1}: Gemini selected frame ${frameIdx} (${selectedFrame.timestamp})`);

      return {
        ...step,
        id: `step-${idx + 1}`,
        thumbnail: selectedFrame.imageBase64
      };
    });

    // Cleanup video temp file
    if (videoFile.tempFilePath) {
      try { fs.unlinkSync(videoFile.tempFilePath); } catch (e) {}
    }

    // Delete file from Gemini using REST API
    try {
      await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`, {
        method: 'DELETE'
      });
      console.log(`[${jobId}] Deleted video from Gemini`);
    } catch (e) {
      console.log(`[${jobId}] Could not delete file from Gemini: ${e.message}`);
    }

    res.json({
      success: true,
      title: result.title,
      description: result.description,
      ppeRequirements: result.ppeRequirements,
      materialsRequired: result.materialsRequired,
      steps: stepsWithFrames,
      allFrames: ffmpegFrames.map(f => ({
        timestamp: f.timestamp,
        imageBase64: f.imageBase64
      })),
      source: 'gemini-native-video'
    });

  } catch (error) {
    console.error(`[${jobId}] Native video analysis error:`, error.message);
    // Cleanup temp file on error
    if (videoFile && videoFile.tempFilePath) {
      try { fs.unlinkSync(videoFile.tempFilePath); } catch (e) {}
    }
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// YOUTUBE NATIVE VIDEO ANALYSIS (Same as upload)
// Downloads YouTube video, uploads to Gemini, uses native video understanding
// ============================================
app.post('/analyze-youtube-native', async (req, res) => {
  const { youtubeUrl, title, sceneThreshold = 0.2, maxFrames = 30, minFrames = 10 } = req.body;

  if (!youtubeUrl) {
    return res.status(400).json({ error: 'Missing youtubeUrl' });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const jobDir = path.join(TEMP_DIR, `yt_native_${jobId}`);

  console.log(`[${jobId}] YouTube NATIVE analysis: ${youtubeUrl}`);
  console.log(`[${jobId}] Title: "${title}"`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });
    const fetch = require('node-fetch');
    const genai = getGenAI();

    // Step 1: Download YouTube video
    console.log(`[${jobId}] Downloading YouTube video...`);
    const videoPath = path.join(jobDir, 'video.mp4');

    // Use Android client to bypass bot detection, add retries
    execSync(
      `yt-dlp --extractor-args "youtube:player_client=android" -f "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best" --merge-output-format mp4 --retries 3 -o "${videoPath}" "${youtubeUrl}"`,
      { timeout: 300000 } // 5 min timeout for download
    );

    if (!fs.existsSync(videoPath)) {
      throw new Error('Failed to download YouTube video');
    }

    const videoStats = fs.statSync(videoPath);
    console.log(`[${jobId}] Downloaded: ${(videoStats.size / 1024 / 1024).toFixed(1)}MB`);

    // Step 2: Extract frames with FFmpeg scene detection (same as regular flow)
    console.log(`[${jobId}] Extracting frames with FFmpeg...`);

    // Get video duration using ffmpeg (parse from stderr output)
    let duration = 60;
    try {
      const ffmpegInfo = execSync(`${FFMPEG_BIN} -i "${videoPath}" 2>&1 || true`, { encoding: 'utf8' });
      const durationMatch = ffmpegInfo.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/);
      if (durationMatch) {
        duration = parseFloat(durationMatch[1]) * 3600 + parseFloat(durationMatch[2]) * 60 + parseFloat(durationMatch[3]);
      }
    } catch (e) {
      console.log(`[${jobId}] Could not parse duration, using default 60s`);
    }
    console.log(`[${jobId}] Video duration: ${duration}s`);

    // Scene detection
    const sceneOutput = execSync(
      `${FFMPEG_BIN} -i "${videoPath}" -vf "select='gt(scene,${sceneThreshold})',showinfo" -f null - 2>&1`,
      { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
    );

    let timestamps = [];
    const regex = /pts_time:([\d.]+)/g;
    let match;
    while ((match = regex.exec(sceneOutput)) !== null) {
      timestamps.push(parseFloat(match[1]));
    }

    // Add start if not present
    if (timestamps.length === 0 || timestamps[0] > 2) {
      timestamps.unshift(0);
    }

    // If not enough scenes, use interval
    if (timestamps.length < minFrames) {
      const interval = duration / minFrames;
      timestamps = Array.from({ length: minFrames }, (_, i) => i * interval);
    }

    // Limit frames
    if (timestamps.length > maxFrames) {
      const step = timestamps.length / maxFrames;
      timestamps = timestamps.filter((_, i) => Math.floor(i % step) === 0).slice(0, maxFrames);
    }

    console.log(`[${jobId}] Extracting ${timestamps.length} frames...`);

    // Extract frames
    const ffmpegFrames = [];
    for (let i = 0; i < timestamps.length; i++) {
      const ts = timestamps[i];
      const framePath = path.join(jobDir, `frame_${i}.jpg`);

      execSync(
        `${FFMPEG_BIN} -ss ${ts} -i "${videoPath}" -vframes 1 -q:v 2 -vf "scale=1280:-1" "${framePath}" -y`,
        { timeout: 10000 }
      );

      if (fs.existsSync(framePath)) {
        const frameData = fs.readFileSync(framePath);
        const fileSize = frameData.length;

        // Filter out "empty" frames - very small files are usually just solid colors/backgrounds
        // A 1280px wide JPEG with actual content should be at least 15KB
        const MIN_FRAME_SIZE = 15000;
        if (fileSize < MIN_FRAME_SIZE) {
          console.log(`[${jobId}] Skipping low-quality frame at ${ts}s (${(fileSize/1024).toFixed(1)}KB)`);
          continue;
        }

        const base64 = `data:image/jpeg;base64,${frameData.toString('base64')}`;
        const mins = Math.floor(ts / 60);
        const secs = Math.floor(ts % 60);
        ffmpegFrames.push({
          timestamp: `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
          timestampSeconds: ts,
          imageBase64: base64
        });
      }
    }

    console.log(`[${jobId}] Extracted ${ffmpegFrames.length} quality frames (filtered low-quality)`);

    // Step 3: Upload video to Gemini File API
    console.log(`[${jobId}] Uploading to Gemini File API...`);

    const videoData = fs.readFileSync(videoPath);
    const mimeType = 'video/mp4';
    const numBytes = videoData.length;

    const startResponse = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
      method: 'POST',
      headers: {
        'x-goog-api-key': GEMINI_API_KEY,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(numBytes),
        'X-Goog-Upload-Header-Content-Type': mimeType,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ file: { display_name: title || 'YouTube Video' } })
    });

    const uploadUrl = startResponse.headers.get('x-goog-upload-url');
    if (!uploadUrl) {
      throw new Error('Failed to get upload URL from Gemini');
    }

    console.log(`[${jobId}] Uploading ${(numBytes / 1024 / 1024).toFixed(1)}MB to Gemini...`);

    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(numBytes),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: videoData
    });

    const uploadResult = await uploadResponse.json();
    if (!uploadResult.file || !uploadResult.file.uri) {
      throw new Error('Failed to upload video to Gemini: ' + JSON.stringify(uploadResult));
    }

    let fileUri = uploadResult.file.uri;
    let fileName = uploadResult.file.name;
    let fileState = uploadResult.file.state;

    console.log(`[${jobId}] File uploaded: ${fileName}, state: ${fileState}`);

    // Wait for processing
    while (fileState === 'PROCESSING') {
      console.log(`[${jobId}] Waiting for Gemini to process video...`);
      await new Promise(resolve => setTimeout(resolve, 2000));

      const statusResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`);
      const statusResult = await statusResponse.json();
      fileState = statusResult.state;
      fileUri = statusResult.uri || fileUri;
    }

    if (fileState === 'FAILED') {
      throw new Error('Gemini video processing failed');
    }

    console.log(`[${jobId}] Video ready, generating SOP...`);

    // Build frame list for Gemini to select from
    const frameListForPrompt = ffmpegFrames.map((f, idx) =>
      `Frame ${idx}: timestamp ${f.timestamp}`
    ).join('\n');

    console.log(`[${jobId}] Sending ${ffmpegFrames.length} frames for Gemini to select from`);

    // Step 4: Generate SOP with native video understanding + frame selection
    const prompt = `
      You are an expert technical writer creating a Standard Operating Procedure (SOP).

      WATCH THIS ENTIRE VIDEO carefully from start to finish. Pay attention to BOTH:
      - AUDIO: What is being SAID (narration, speech, instructions)
      - VISUAL: What ACTIONS are being performed on screen

      Create a detailed SOP for: "${title || 'Procedure'}"

      CRITICAL REQUIREMENTS:
      1. If the video has narration/speech, use the presenter's EXACT words
      2. If the video has NO narration (silent/music only), describe the VISUAL actions clearly
      3. Each step should describe ONE specific action shown in the video
      4. Provide accurate timestamps (MM:SS) for when each action STARTS
      5. Do NOT skip any actions - document EVERY distinct action
      6. Use clear, actionable language: "Remove the screw", "Cut along the line", "Insert the tool"
      7. ALWAYS write in ENGLISH
      8. Note ALL tools, materials, or equipment visible/mentioned

      IMPORTANT - FRAME SELECTION:
      I have extracted the following frames from the video. For EACH step, you MUST select
      the frame that BEST shows the action being described. Choose the frame where the
      action is VISIBLE - not where it's being discussed, but where it's actually SHOWN.

      Available frames:
      ${frameListForPrompt}

      For each step provide:
      - timestamp: When this action starts (MM:SS format, e.g., "00:45")
      - title: Short action title (2-5 words, starts with verb)
      - description: Clear step-by-step instructions for this specific action
      - frameIndex: The frame number (0-${ffmpegFrames.length - 1}) that BEST shows this action visually
      - safetyWarnings: Array of any safety concerns (or empty array)
      - toolsRequired: Array of tools/materials used in this step (or empty array)
    `;

    const response = await genai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          { fileData: { fileUri: fileUri, mimeType: mimeType } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            ppeRequirements: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            materialsRequired: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  frameIndex: { type: Type.NUMBER },
                  safetyWarnings: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  toolsRequired: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["id", "timestamp", "title", "description", "frameIndex"]
              }
            }
          },
          required: ["title", "description", "steps", "ppeRequirements", "materialsRequired"]
        }
      }
    });

    const resultText = response.text;
    const result = JSON.parse(resultText);

    console.log(`[${jobId}] Gemini generated ${result.steps?.length || 0} steps`);
    console.log(`[${jobId}] SOP Title: "${result.title}"`);
    console.log(`[${jobId}] Materials: ${result.materialsRequired?.join(', ') || 'none'}`);
    // Log first 3 steps for debugging (now with frame selection)
    result.steps?.slice(0, 3).forEach((s, i) => {
      console.log(`[${jobId}] Step ${i+1}: [${s.timestamp}] ${s.title} → Frame ${s.frameIndex}`);
    });

    // Step 5: Use Gemini's frame selection (no more timestamp matching!)
    const stepsWithFrames = result.steps.map((step, idx) => {
      if (ffmpegFrames.length === 0) {
        return { ...step, id: `step-${idx + 1}` };
      }

      // Use Gemini's selected frame, with bounds checking
      const frameIdx = Math.max(0, Math.min(step.frameIndex || 0, ffmpegFrames.length - 1));
      const selectedFrame = ffmpegFrames[frameIdx];

      console.log(`[${jobId}] Step ${idx + 1}: Gemini selected frame ${frameIdx} (${selectedFrame.timestamp})`);

      return {
        ...step,
        id: `step-${idx + 1}`,
        thumbnail: selectedFrame.imageBase64
      };
    });

    // Cleanup
    try {
      await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' });
      console.log(`[${jobId}] Deleted video from Gemini`);
    } catch (e) {}

    cleanup(jobDir);

    res.json({
      success: true,
      title: result.title,
      description: result.description,
      ppeRequirements: result.ppeRequirements,
      materialsRequired: result.materialsRequired,
      steps: stepsWithFrames,
      allFrames: ffmpegFrames.map(f => ({
        timestamp: f.timestamp,
        imageBase64: f.imageBase64
      })),
      source: 'gemini-native-youtube'
    });

  } catch (error) {
    console.error(`[${jobId}] YouTube native error:`, error.message);
    cleanup(jobDir);
    res.status(500).json({ error: error.message });
  }
});

app.post('/analyze-sop', async (req, res) => {
  const { frames, title, additionalContext = '', vitTags = [] } = req.body;

  if (!frames || !Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({ error: 'Missing or empty frames array' });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  console.log(`[${jobId}] Analyzing ${frames.length} frames for SOP: "${title}"`);

  // Log if transcript was provided
  const hasTranscript = additionalContext && additionalContext.length > 50;
  console.log(`[${jobId}] Context provided: ${additionalContext?.length || 0} chars, has transcript: ${hasTranscript}`);
  if (hasTranscript) {
    console.log(`[${jobId}] Transcript preview: "${additionalContext.substring(0, 200)}..."`);
  }

  try {
    const validImageParts = frames
      .filter(f => f && (f.includes('base64,') || f.startsWith('http')))
      .map(f => {
        if (f.includes('base64,')) {
          const parts = f.split('base64,');
          return {
            inlineData: {
              mimeType: "image/jpeg",
              data: parts[1]
            }
          };
        }
        return null;
      })
      .filter(p => p !== null);

    if (validImageParts.length === 0) {
      return res.status(400).json({ error: 'No valid image data found in frames' });
    }

    console.log(`[${jobId}] Valid image parts: ${validImageParts.length}`);

    // Check if additionalContext contains a transcript
    const hasTranscript = additionalContext.includes('VIDEO TRANSCRIPT:') &&
      additionalContext.split('VIDEO TRANSCRIPT:')[1]?.trim().length > 50;

    // Check if transcript is matched to frames (new format)
    const hasFrameMatchedTranscript = additionalContext.includes('TRANSCRIPT MATCHED TO FRAMES:');

    const transcriptInstructions = hasFrameMatchedTranscript ? `
      CRITICAL - TRANSCRIPT MATCHED TO EACH FRAME:
      You have BOTH the full transcript AND per-frame matched text.

      STEP 1: Read the FULL TRANSCRIPT first to understand ALL steps in the procedure.
      STEP 2: For each frame, use the matched transcript text to write that step.

      YOU MUST USE THE PRESENTER'S EXACT WORDS:
      - If transcript says "lift the tab on the right side" → write "Lift the tab on the right side"
      - If transcript says "use a screwdriver to remove the bracket" → include that step!
      - If transcript says "be careful not to touch the sensor" → include that warning
      - COPY the presenter's terminology, tools mentioned, and specific instructions
      - DO NOT paraphrase into generic text like "open the lid" when presenter said "lift the tab"
      - DO NOT skip important steps mentioned in transcript (tools, removal steps, warnings)

      CRITICAL: Check the FULL TRANSCRIPT - if an important action (like removing a bracket, using a specific tool) is mentioned but doesn't have a matching frame, still include it in the nearest relevant step!

      The transcript IS the instruction - your job is to format it properly, NOT rewrite it!
    ` : hasTranscript ? `
      CRITICAL - USE THE PRESENTER'S EXACT WORDS FROM TRANSCRIPT:
      You have been provided with the audio transcript. This is what the presenter ACTUALLY SAID.

      YOU MUST:
      - Use the presenter's EXACT words and terminology in your step descriptions
      - If presenter says "lift the tab on the right" → write that, NOT "open the lid"
      - If presenter mentions specific tools, parts, measurements → use those exact terms
      - If presenter gives warnings → include those exact warnings
      - DO NOT paraphrase into generic instructions
      - DO NOT write corporate-speak when presenter used simple language

      The transcript tells you WHAT to write. The frames show you WHEN each instruction happens.
      Your job is to match transcript sections to frames, NOT to rewrite the instructions!
    ` : `
      CRITICAL - NO AUDIO/TRANSCRIPT AVAILABLE (Visual-only video):
      This video has no speech or narration. You must analyze the frames VISUALLY and write as the INSTRUCTOR.

      IMPORTANT WRITING STYLE:
      - Write as if YOU are the expert teaching this procedure
      - Use direct, imperative instructions: "Position the tool", "Apply pressure", "Insert the component"
      - NEVER write from an observer perspective like:
        ❌ "The video shows..."
        ❌ "We can see that..."
        ❌ "The person is doing..."
        ❌ "In this frame..."
        ❌ "It appears that..."

      - ALWAYS write as the instructor:
        ✅ "Position the bracket against the mounting surface"
        ✅ "Apply firm pressure while turning clockwise"
        ✅ "Ensure the component is fully seated before proceeding"

      - Deduce the actions from visual cues: hand positions, tool angles, component states
      - If you see hands holding a screwdriver at an angle, write: "Insert the screwdriver at a 45-degree angle"
      - If you see a component being aligned, write: "Align the edges carefully before pressing down"
    `;

    const vitContext = vitTags.length > 0
      ? `PRECISION VISION TAGS (Detected via ViT): ${vitTags.join(", ")}. These items are positively identified in the video.`
      : "";

    const prompt = `
      You are an expert technical writer creating a Standard Operating Procedure (SOP).
      You write as THE INSTRUCTOR - as if you are the expert teaching someone how to perform this task.

      IMPORTANT: You are given exactly ${validImageParts.length} frames in chronological order from a procedure video titled: "${title}".
      ${transcriptInstructions}
      ${additionalContext ? `\nCONTEXT AND TRANSCRIPT:\n${additionalContext}` : ''}
      ${vitContext}

      YOUR TASK:
      Generate EXACTLY ${validImageParts.length} steps - one step for each frame, in the same order.

      - Step 1 describes what to DO based on Frame 1
      - Step 2 describes what to DO based on Frame 2
      - Step 3 describes what to DO based on Frame 3
      ... and so on for all ${validImageParts.length} frames.

      WRITING RULES (CRITICAL):
      - Write in IMPERATIVE form - direct instructions to the reader
      - You ARE the instructor teaching this procedure
      - NEVER describe what "the video shows" or what "the person does"
      - ALWAYS write what the READER should do: "Grip the handle firmly", "Rotate 90 degrees clockwise"
      - LANGUAGE: ALWAYS write the SOP in ENGLISH unless the user explicitly provides context in another language. Ignore any text visible in the video frames - only match language if the TRANSCRIPT or USER CONTEXT is in another language.

      For each step:
      - Write a clear, actionable title (e.g., "Tighten the mounting bolt")
      - Write a detailed description of WHAT TO DO and HOW to do it
      - Use imperative language ("Position", "Insert", "Tighten", "Verify")
      - Include specific details: measurements, settings, tool names
      - Include specific visual details (hand positions, component alignment)
      - Add safety warnings where appropriate

      You MUST return exactly ${validImageParts.length} steps. No more, no less.

      THUMBNAIL SELECTION:
      Also select the BEST frame to use as the cover image/thumbnail for this SOP.
      Choose a frame (by index, 0-based) that:
      - Shows the main action or most representative moment
      - Is visually clear and not blurry
      - Gives a good preview of what this procedure is about
      - Avoids intro/setup frames or end frames
      - Preferably shows hands doing the work or the key result
      Return this as "bestThumbnailIndex" (integer 0 to ${validImageParts.length - 1})
    `;

    console.log(`[${jobId}] Calling Gemini 2.0 Flash...`);

    const response = await getGenAI().models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          ...validImageParts,
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            ppeRequirements: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            materialsRequired: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            steps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  timestamp: { type: Type.STRING },
                  title: { type: Type.STRING },
                  description: { type: Type.STRING },
                  safetyWarnings: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                  toolsRequired: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: ["id", "title", "description", "timestamp"]
              }
            },
            bestThumbnailIndex: { type: Type.INTEGER }
          },
          required: ["title", "description", "steps", "ppeRequirements", "materialsRequired", "bestThumbnailIndex"]
        }
      }
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from Gemini');
    }

    const result = JSON.parse(text.trim());
    console.log(`[${jobId}] Gemini returned ${result.steps?.length || 0} steps`);

    res.json({ success: true, ...result });

  } catch (error) {
    console.error(`[${jobId}] Gemini analysis error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// WHISPER TRANSCRIPTION (OpenAI)
// Best-in-class speech-to-text
// ============================================

// Transcribe audio using OpenAI Whisper
app.post('/whisper-transcribe', async (req, res) => {
  const { audioBase64, mimeType = 'audio/webm', language } = req.body;

  if (!audioBase64) {
    return res.status(400).json({ error: 'Missing audioBase64' });
  }

  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not configured - falling back to Gemini');
    // Fallback to Gemini if no OpenAI key
    return res.redirect(307, '/transcribe-audio');
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  console.log(`[${jobId}] Whisper transcription: ${(audioBase64.length / 1024).toFixed(1)}KB`);

  try {
    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    // Determine file extension from mimeType
    let ext = 'webm';
    if (mimeType.includes('mp3') || mimeType.includes('mpeg')) ext = 'mp3';
    else if (mimeType.includes('mp4')) ext = 'mp4';
    else if (mimeType.includes('wav')) ext = 'wav';
    else if (mimeType.includes('ogg')) ext = 'ogg';

    // Create FormData for OpenAI API
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', audioBuffer, { filename: `audio.${ext}`, contentType: mimeType });
    formData.append('model', 'whisper-1');
    if (language) {
      formData.append('language', language);
    }
    formData.append('response_format', 'verbose_json');

    console.log(`[${jobId}] Sending to OpenAI Whisper API...`);

    const fetch = require('node-fetch');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${jobId}] OpenAI API error:`, response.status, errorText);
      throw new Error(`OpenAI Whisper error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[${jobId}] Whisper transcription: ${data.text?.length || 0} chars, ${data.segments?.length || 0} segments`);

    res.json({
      success: true,
      transcription: data.text || '',
      segments: data.segments || [],
      duration: data.duration,
      source: 'whisper'
    });

  } catch (error) {
    console.error(`[${jobId}] Whisper error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Transcribe uploaded video audio using Whisper
app.post('/whisper-transcribe-video', async (req, res) => {
  const uploadedFile = req.files?.video || req.files?.file;

  if (!uploadedFile) {
    return res.status(400).json({ error: 'Missing video file upload' });
  }

  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not configured - falling back to Gemini');
    return res.redirect(307, '/transcribe-video-audio');
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const jobDir = path.join(TEMP_DIR, `whisper_${jobId}`);

  console.log(`[${jobId}] Whisper video transcription: ${uploadedFile.name}`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    // Save uploaded file
    const videoPath = path.join(jobDir, 'video.mp4');
    await uploadedFile.mv(videoPath);
    console.log(`[${jobId}] Video saved: ${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB`);

    // Extract audio with FFmpeg (Whisper needs audio file)
    const mp3Path = path.join(jobDir, 'audio.mp3');
    const maxDuration = 300; // 5 minutes max for Whisper (25MB limit)

    try {
      execSync(
        `${FFMPEG_BIN} -i "${videoPath}" -t ${maxDuration} -ar 16000 -ac 1 -b:a 64k "${mp3Path}" -y`,
        { timeout: 60000 }
      );
      console.log(`[${jobId}] Audio extracted`);
    } catch (ffmpegErr) {
      console.error(`[${jobId}] FFmpeg failed:`, ffmpegErr.message);
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'ffmpeg-failed' });
    }

    if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size < 1000) {
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'no-audio' });
    }

    const audioBuffer = fs.readFileSync(mp3Path);
    const audioSize = audioBuffer.length;
    console.log(`[${jobId}] Audio size: ${(audioSize / 1024).toFixed(0)} KB`);

    // Check Whisper 25MB limit
    if (audioSize > 25 * 1024 * 1024) {
      console.warn(`[${jobId}] Audio exceeds 25MB, may fail`);
    }

    // Send to Whisper
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    console.log(`[${jobId}] Sending to OpenAI Whisper...`);

    const fetch = require('node-fetch');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${jobId}] OpenAI error:`, response.status, errorText);
      cleanup(jobDir);
      throw new Error(`Whisper error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[${jobId}] Transcription: ${data.text?.length || 0} chars`);

    cleanup(jobDir);
    res.json({
      success: true,
      transcript: data.text || '',
      segments: data.segments || [],
      duration: data.duration,
      source: 'whisper'
    });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    cleanup(jobDir);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Transcribe YouTube video audio using Whisper
app.post('/whisper-transcribe-youtube', async (req, res) => {
  const { youtubeUrl } = req.body;

  if (!youtubeUrl) {
    return res.status(400).json({ error: 'Missing youtubeUrl' });
  }

  if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not configured - falling back to Gemini');
    return res.redirect(307, '/get-transcript');
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const jobDir = path.join(TEMP_DIR, `whisper_yt_${jobId}`);

  console.log(`[${jobId}] Whisper YouTube transcription: ${youtubeUrl}`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    // First try to get YouTube subtitles (free and fast)
    const tempFile = path.join(jobDir, 'subs');
    try {
      execSync(
        `yt-dlp --skip-download --write-auto-subs --write-subs --sub-format "vtt/srt/best" --sub-langs "en.*,sv.*,de.*,fr.*,es.*" -o "${tempFile}" "${youtubeUrl}"`,
        { timeout: 30000, stdio: 'pipe' }
      );
    } catch (e) {
      console.log(`[${jobId}] No YouTube subtitles available`);
    }

    const subFiles = fs.readdirSync(jobDir).filter(f => f.endsWith('.vtt') || f.endsWith('.srt'));
    if (subFiles.length > 0) {
      console.log(`[${jobId}] Using YouTube subtitles: ${subFiles[0]}`);
      const content = fs.readFileSync(path.join(jobDir, subFiles[0]), 'utf8');
      const transcript = content
        .replace(/WEBVTT/g, '')
        .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/^\d+$/gm, '')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join(' ')
        .substring(0, 20000);

      cleanup(jobDir);
      return res.json({ success: true, transcript, source: 'youtube-subtitles' });
    }

    // No subtitles - download audio and use Whisper
    console.log(`[${jobId}] Downloading audio for Whisper...`);
    const audioTemplate = path.join(jobDir, 'audio.%(ext)s');

    try {
      execSync(
        `yt-dlp -x --audio-format mp3 --audio-quality 5 -o "${audioTemplate}" "${youtubeUrl}"`,
        { timeout: 120000 }
      );
    } catch (dlErr) {
      console.error(`[${jobId}] Audio download failed:`, dlErr.message);
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'download-failed' });
    }

    const audioFiles = fs.readdirSync(jobDir).filter(f =>
      f.startsWith('audio.') && (f.endsWith('.mp3') || f.endsWith('.m4a') || f.endsWith('.webm'))
    );

    if (audioFiles.length === 0) {
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'no-audio' });
    }

    // Convert to mp3 and trim for Whisper
    const srcAudio = path.join(jobDir, audioFiles[0]);
    const mp3Path = path.join(jobDir, 'final.mp3');
    const maxDuration = 300; // 5 minutes

    execSync(
      `${FFMPEG_BIN} -i "${srcAudio}" -t ${maxDuration} -ar 16000 -ac 1 -b:a 64k "${mp3Path}" -y`,
      { timeout: 60000 }
    );

    const audioBuffer = fs.readFileSync(mp3Path);
    console.log(`[${jobId}] Audio: ${(audioBuffer.length / 1024).toFixed(0)} KB, sending to Whisper...`);

    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', audioBuffer, { filename: 'audio.mp3', contentType: 'audio/mpeg' });
    formData.append('model', 'whisper-1');
    formData.append('response_format', 'verbose_json');

    const fetch = require('node-fetch');
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[${jobId}] Whisper error:`, response.status, errorText);
      cleanup(jobDir);
      throw new Error(`Whisper error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[${jobId}] Whisper result: ${data.text?.length || 0} chars`);

    cleanup(jobDir);
    res.json({
      success: true,
      transcript: data.text || '',
      segments: data.segments || [],
      duration: data.duration,
      source: 'whisper'
    });

  } catch (error) {
    console.error(`[${jobId}] Error:`, error.message);
    cleanup(jobDir);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Transcribe audio from uploaded video file
app.post('/transcribe-video-audio', async (req, res) => {
  const uploadedFile = req.files?.video || req.files?.file;

  if (!uploadedFile) {
    return res.status(400).json({ error: 'Missing video file upload' });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  const jobDir = path.join(TEMP_DIR, `transcribe_${jobId}`);

  console.log(`[${jobId}] Transcribing audio from uploaded video: ${uploadedFile.name}`);

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    // Save uploaded file
    const videoPath = path.join(jobDir, 'video.mp4');
    await uploadedFile.mv(videoPath);
    console.log(`[${jobId}] Video saved: ${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB`);

    // Extract audio with FFmpeg
    const mp3Path = path.join(jobDir, 'audio.mp3');
    const maxDuration = 300; // 5 minutes max

    try {
      execSync(
        `${FFMPEG_BIN} -i "${videoPath}" -t ${maxDuration} -ar 16000 -ac 1 -b:a 64k "${mp3Path}" -y`,
        { timeout: 60000 }
      );
      console.log(`[${jobId}] Audio extracted to mp3`);
    } catch (ffmpegErr) {
      console.error(`[${jobId}] FFmpeg audio extraction failed:`, ffmpegErr.message);
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'ffmpeg-failed' });
    }

    if (!fs.existsSync(mp3Path) || fs.statSync(mp3Path).size < 1000) {
      console.log(`[${jobId}] No audio or audio too small`);
      cleanup(jobDir);
      return res.json({ success: true, transcript: '', source: 'no-audio' });
    }

    // Read audio as base64
    const audioBuffer = fs.readFileSync(mp3Path);
    const audioBase64 = audioBuffer.toString('base64');
    console.log(`[${jobId}] Audio size: ${(audioBuffer.length / 1024).toFixed(0)} KB, sending to Gemini...`);

    // Transcribe with Gemini
    const response = await getGenAI().models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'audio/mpeg',
              data: audioBase64
            }
          },
          {
            text: `Listen to this audio and transcribe ALL spoken words accurately.

IMPORTANT:
- This is from an instructional/tutorial video
- Transcribe EVERYTHING that is spoken
- Keep the original language (do not translate)
- Output ONLY the transcription, nothing else
- If there is background music, ignore it and focus on speech
- If you hear speech, you MUST transcribe it

Begin transcription:`
          }
        ]
      }
    });

    const transcription = response.text?.trim() || '';
    console.log(`[${jobId}] Transcription result: ${transcription.length} chars`);
    if (transcription.length > 0) {
      console.log(`[${jobId}] First 200 chars: ${transcription.substring(0, 200)}`);
    }

    cleanup(jobDir);
    return res.json({
      success: true,
      transcript: transcription.substring(0, 20000),
      source: 'gemini-audio'
    });

  } catch (error) {
    console.error(`[${jobId}] Transcription error:`, error.message);
    cleanup(jobDir);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Transcribe audio file using Gemini
app.post('/transcribe-audio', async (req, res) => {
  const { audioBase64, mimeType = 'audio/webm' } = req.body;

  if (!audioBase64) {
    return res.status(400).json({ error: 'Missing audioBase64' });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  console.log(`[${jobId}] Transcribing audio: ${(audioBase64.length / 1024).toFixed(1)}KB`);

  try {
    const response = await getGenAI().models.generateContent({
      model: "gemini-2.0-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64
            }
          },
          {
            text: `Transcribe this audio recording accurately. The speaker is explaining a technical procedure or demonstration.

CRITICAL RULES:
- Output ONLY the transcription text, no timestamps or speaker labels
- KEEP THE ORIGINAL LANGUAGE - transcribe in whatever language is spoken. DO NOT TRANSLATE.
- Supports all languages: English, Swedish, German, Spanish, French, Japanese, Chinese, etc.
- Include all spoken words, even filler words if they help context
- If audio is unclear, do your best to interpret
- If there is no speech at all, return an empty string

Listen carefully and transcribe exactly what is said:`
          }
        ]
      }
    });

    const transcription = response.text?.trim() || '';
    console.log(`[${jobId}] Transcription result (${transcription.length} chars):`);
    console.log(`[${jobId}] >>> "${transcription.substring(0, 300)}${transcription.length > 300 ? '...' : ''}"`);

    res.json({ success: true, transcription });

  } catch (error) {
    console.error(`[${jobId}] Transcription error:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === API Helper Functions (for /api/v1 routes) ===

/**
 * Process YouTube video and generate SOP
 * Used by: POST /api/v1/generate-sop
 */
app.locals.processYouTubeVideo = async ({ videoId, title, detailLevel, includeImages }) => {
  // Extract frames using scene detection
  const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // Map detail level to frame count
  const frameTargets = { quick: 8, normal: 15, detailed: 30 };
  const targetFrames = frameTargets[detailLevel] || 15;

  // TODO: Call existing extract-frames-scene-detect logic
  // For now, return a placeholder
  return {
    id: `sop_${crypto.randomBytes(8).toString('hex')}`,
    title: title || `SOP from YouTube ${videoId}`,
    description: 'Generated from YouTube video',
    steps: [],
    ppe_requirements: [],
    materials_required: [],
    created_at: new Date().toISOString()
  };
};

/**
 * Analyze frames and generate SOP
 * Used by: POST /api/v1/analyze-frames
 */
app.locals.analyzeFrames = async ({ frames, title, additionalContext }) => {
  // This calls the existing analyze-sop logic
  const genai = getGenAI();

  // Reuse the prompt and logic from /analyze-sop endpoint
  const validImageParts = frames
    .filter(f => f && (f.includes('base64,') || f.startsWith('http')))
    .map(f => {
      if (f.includes('base64,')) {
        const parts = f.split('base64,');
        return {
          inlineData: {
            mimeType: "image/jpeg",
            data: parts[1]
          }
        };
      }
      return null;
    })
    .filter(p => p !== null);

  if (validImageParts.length === 0) {
    throw new Error('No valid image data found in frames');
  }

  const prompt = `
    You are an expert technical writer creating a Standard Operating Procedure (SOP).
    Analyze these ${validImageParts.length} frames and generate a step-by-step procedure.
    Title: "${title}"
    ${additionalContext ? `Context: ${additionalContext}` : ''}

    LANGUAGE: If context is provided, write the SOP in the SAME LANGUAGE as the context. Swedish context = Swedish SOP. Otherwise use English.

    Return JSON with: title, description, steps (array with title, description), ppe_requirements, materials_required
  `;

  const response = await genai.models.generateContent({
    model: "gemini-2.0-flash",
    contents: {
      parts: [...validImageParts, { text: prompt }]
    },
    config: {
      responseMimeType: "application/json"
    }
  });

  const result = JSON.parse(response.text);
  return {
    id: `sop_${crypto.randomBytes(8).toString('hex')}`,
    ...result,
    created_at: new Date().toISOString()
  };
};

// Global Express error handler - catches any unhandled errors in routes
app.use((err, req, res, next) => {
  console.error('EXPRESS ERROR HANDLER:', err.message);
  console.error(err.stack);
  if (res.headersSent) {
    return next(err);
  }
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`FrameOps Backend running on port ${PORT}`);
  console.log('=== VERSION 18: GEMINI SELECTS FRAMES DIRECTLY ===');
  console.log(`Gemini API Key: ${GEMINI_API_KEY ? 'configured' : 'MISSING!'}`);
  console.log(`API Docs: http://localhost:${PORT}/api/docs`);
});

// If running standalone, log UI URL
console.log(`Web UI available at http://localhost:${PORT}/`);
