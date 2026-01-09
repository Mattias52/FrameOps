# Copilot Instructions for FrameOps

## Overview
FrameOps is an AI-powered SOP generator that analyzes videos to produce step-by-step procedures. It consists of a React/TypeScript frontend and a Node.js backend (deployed via Railway) for video processing. Supabase is used for data storage, and Google Gemini 2.0 Flash powers the AI analysis.

## Architecture
- **Frontend** (`App.tsx`, `components/`, `services/`):
  - React 19 + TypeScript + Vite + Tailwind CSS
  - Main entry: `App.tsx`, routes and UI in `components/`
  - Service modules in `services/` handle API calls (Gemini, Supabase, Vision, YouTube)
- **Backend** (`backend/`):
  - Node.js Express server
  - FFmpeg for scene detection, yt-dlp for YouTube downloads
  - Endpoints for frame extraction, transcript retrieval, and frame matching
- **Database**: Supabase (SQL schema in `supabase/migrations/`)
- **AI**: Google Gemini 2.0 Flash (API key required)

## Developer Workflows
- **Frontend**
  - Install: `npm install`
  - Start dev server: `npm run dev`
  - Environment: `.env` file with Supabase and Gemini keys
- **Backend**
  - Install: `cd backend && npm install`
  - Start dev server: `npm run dev` (default port 3000)
  - Deploy: Use Railway, set root to `/backend`, configure env vars

## Key Patterns & Conventions
- **Service Layer**: All external API calls are abstracted in `services/` (e.g., `geminiService.ts`, `supabaseService.ts`).
- **Component Structure**: Major features are split into dedicated components:
  - `SOPGenerator.tsx`: Handles YouTube/Upload SOP flows
  - `LiveSOPGenerator.tsx`: Real-time camera SOP
  - `SOPLibrary.tsx`: Displays saved SOPs
- **Backend Endpoints**:
  - `/extract-frames-scene-detect`: POST, expects video input
  - `/match-frames`: POST, matches frames to SOP steps
  - `/get-transcript`: POST, fetches YouTube transcript
- **Database Migrations**: SQL files in `supabase/migrations/` define schema

## Integration Points
- **Frontend ↔ Backend**: API calls via service modules
- **Backend ↔ Supabase**: Direct SQL or REST API
- **AI (Gemini)**: API key required, used in `geminiService.ts`
- **Video Processing**: FFmpeg and yt-dlp in backend

## Examples
- To add a new SOP input type, create a new component in `components/` and a service in `services/`.
- To extend backend processing, add a new Express route in `backend/index.js` and document it in backend README.

## References
- Main architecture: [README.md](README.md)
- Backend details: [backend/README.md](backend/README.md)
- Database schema: [supabase/migrations/](supabase/migrations/)
- Service patterns: [services/](services/)

---
For questions or unclear conventions, review the referenced files or ask for clarification.
