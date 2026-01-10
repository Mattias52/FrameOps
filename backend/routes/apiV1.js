const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { validateApiKey, logApiUsage, checkUsageLimit } = require('../middleware/apiAuth');

// Rate limiters for different plans
const freeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: { error: 'Rate limit exceeded', message: 'Free plan: 10 requests per minute. Upgrade for more.' }
});

const proLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Rate limit exceeded', message: 'Pro plan: 60 requests per minute.' }
});

// Dynamic rate limiter based on plan
const dynamicLimiter = (req, res, next) => {
  if (req.apiKey?.plan === 'pro' || req.apiKey?.plan === 'enterprise') {
    return proLimiter(req, res, next);
  }
  return freeLimiter(req, res, next);
};

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: API health check
 *     description: Check if the API is operational (no auth required)
 *     tags: [System]
 *     security: []
 *     responses:
 *       200:
 *         description: API is healthy
 */
// Health check - NO AUTH REQUIRED (must be before middleware)
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// Apply middleware to all OTHER routes
router.use(validateApiKey);
router.use(logApiUsage);
router.use(checkUsageLimit);
router.use(dynamicLimiter);

/**
 * @swagger
 * /api/v1/generate-sop:
 *   post:
 *     summary: Generate SOP from YouTube video
 *     description: |
 *       Analyzes a YouTube video and generates a complete Standard Operating Procedure.
 *
 *       The AI will:
 *       - Extract key frames from the video
 *       - Analyze visual content and audio transcript
 *       - Generate step-by-step instructions
 *       - Identify required PPE and materials
 *     tags: [SOP Generation]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenerateSOPRequest'
 *           examples:
 *             youtube:
 *               summary: Generate from YouTube
 *               value:
 *                 youtube_url: "https://www.youtube.com/watch?v=example"
 *                 detail_level: "normal"
 *     responses:
 *       200:
 *         description: SOP generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 sop: { $ref: '#/components/schemas/SOP' }
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Invalid or missing API key
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/generate-sop', async (req, res) => {
  const { youtube_url, title, detail_level = 'normal', include_images = true } = req.body;

  if (!youtube_url) {
    return res.status(400).json({
      error: 'Missing required field',
      message: 'youtube_url is required'
    });
  }

  // Validate YouTube URL
  const ytRegex = /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = youtube_url.match(ytRegex);
  if (!match) {
    return res.status(400).json({
      error: 'Invalid YouTube URL',
      message: 'Please provide a valid YouTube video URL'
    });
  }

  const videoId = match[1];

  try {
    // Forward to internal processing (reuse existing logic)
    // This will be connected to the existing frame extraction and analysis
    const response = await req.app.locals.processYouTubeVideo({
      videoId,
      title,
      detailLevel: detail_level,
      includeImages: include_images
    });

    res.json({
      success: true,
      sop: response
    });

  } catch (error) {
    console.error('Generate SOP error:', error);
    res.status(500).json({
      error: 'Processing failed',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/v1/analyze-frames:
 *   post:
 *     summary: Analyze uploaded frames
 *     description: |
 *       Generate an SOP from your own images/frames.
 *       Useful for:
 *       - Processing local video files
 *       - Creating SOPs from screenshots
 *       - Custom frame selection
 *     tags: [SOP Generation]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AnalyzeFramesRequest'
 *     responses:
 *       200:
 *         description: Frames analyzed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 sop: { $ref: '#/components/schemas/SOP' }
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Invalid or missing API key
 */
router.post('/analyze-frames', async (req, res) => {
  const { frames, title = 'Untitled Procedure', context = '' } = req.body;

  if (!frames || !Array.isArray(frames) || frames.length === 0) {
    return res.status(400).json({
      error: 'Invalid frames',
      message: 'Please provide an array of base64 encoded images'
    });
  }

  if (frames.length > 50) {
    return res.status(400).json({
      error: 'Too many frames',
      message: 'Maximum 50 frames per request'
    });
  }

  try {
    // Forward to existing analyze-sop logic
    const response = await req.app.locals.analyzeFrames({
      frames,
      title,
      additionalContext: context
    });

    res.json({
      success: true,
      sop: response
    });

  } catch (error) {
    console.error('Analyze frames error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/v1/usage:
 *   get:
 *     summary: Get API usage statistics
 *     description: Returns your current API usage and limits
 *     tags: [Account]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: Usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UsageStats'
 */
router.get('/usage', async (req, res) => {
  const limits = {
    free: 100,
    pro: 10000,
    enterprise: 999999
  };

  res.json({
    plan: req.apiKey.plan,
    requests_limit: limits[req.apiKey.plan] || 100,
    reset_date: new Date(new Date().setMonth(new Date().getMonth() + 1, 1)).toISOString()
  });
});

module.exports = router;
