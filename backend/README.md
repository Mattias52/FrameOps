# FrameOps Backend

Railway-deployed backend service for video processing with FFmpeg scene detection.

## Features

- YouTube video download via yt-dlp
- FFmpeg scene detection for automatic frame extraction
- File upload support for local videos
- VIT-based frame matching via HuggingFace
- YouTube transcript extraction

## Environment Variables

Required for Railway deployment:

```env
PORT=3000
HF_API_TOKEN=your_huggingface_api_token
```

## Endpoints

- `GET /health` - Health check
- `POST /extract-frames-scene-detect` - Extract frames with scene detection
- `POST /match-frames` - Match frames to step texts using VIT
- `POST /get-transcript` - Get YouTube video transcript

## Local Development

```bash
cd backend
npm install
npm run dev
```

## Deploy to Railway

1. Connect this repo to Railway
2. Set the root directory to `/backend`
3. Add environment variables
4. Deploy!
