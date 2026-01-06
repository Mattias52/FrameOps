const express = require('express');
const cors = require('cors');
const { execSync, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const fileUpload = require('express-fileupload');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Add file upload middleware for uploaded videos (2GB max for Supabase Pro)
app.use(fileUpload({
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  useTempFiles: true,
  tempFileDir: path.join(os.tmpdir(), 'uploads')
}));

// Serve simple web UI
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const TEMP_DIR = process.env.TEMP_DIR || path.join(os.tmpdir(), 'frames');

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
  res.json({ status: 'ok', version: '12.0.0' });
});

// Get transcript from YouTube video
app.post('/get-transcript', async (req, res) => {
  const { youtubeUrl } = req.body;

  if (!youtubeUrl) {
    return res.status(400).json({ error: 'Missing youtubeUrl' });
  }

  const jobId = crypto.randomBytes(8).toString('hex');
  console.log(`[${jobId}] Fetching transcript for ${youtubeUrl}`);

  try {
    // Try to get auto-generated or manual subtitles using yt-dlp
    // We use --skip-download and --write-auto-subs --write-subs
    const tempFile = path.join(TEMP_DIR, `subs_${jobId}`);

    try {
      execSync(
        `yt-dlp --skip-download --write-auto-subs --write-subs --sub-format "vtt/srt/best" --sub-langs "en.*,sv.*" -o "${tempFile}" "${youtubeUrl}"`,
        { timeout: 30000 }
      );
    } catch (e) {
      console.error(`[${jobId}] yt-dlp transcript fetch failed:`, e.message);
    }

    // Find the generated subtitle file
    const files = fs.readdirSync(TEMP_DIR).filter(f => f.startsWith(`subs_${jobId}`) && (f.endsWith('.vtt') || f.endsWith('.srt')));

    if (files.length === 0) {
      console.log(`[${jobId}] No subtitles found via yt-dlp, returning empty`);
      return res.json({ success: true, transcript: "", source: "none" });
    }

    const subFile = path.join(TEMP_DIR, files[0]);
    const content = fs.readFileSync(subFile, 'utf8');

    // Basic cleanup of VTT/SRT to plain text
    const plainText = content
      .replace(/WEBVTT/g, '')
      .replace(/\d{2}:\d{2}:\d{2}\.\d{3} --> \d{2}:\d{2}:\d{2}\.\d{3}/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/^\d+$/gm, '')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join(' ');

    // Cleanup temp files
    files.forEach(f => fs.unlinkSync(path.join(TEMP_DIR, f)));

    res.json({
      success: true,
      transcript: plainText.substring(0, 20000), // Cap at 20k chars for Gemini
      source: files[0].includes('auto') ? 'auto-generated' : 'manual'
    });

  } catch (error) {
    console.error(`[${jobId}] Transcript error:`, error.message);
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

app.listen(PORT, () => {
  console.log(`FrameOps Backend running on port ${PORT}`);
  console.log('=== VERSION 12: FIXED VIDEO DOWNLOAD + SCENE DETECTION ===');
});

// If running standalone, log UI URL
console.log(`Web UI available at http://localhost:${PORT}/`);
