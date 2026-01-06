# FrameOps

AI-powered Standard Operating Procedure (SOP) generator with video analysis.

## Features

### 3 Input Pipelines
1. **YouTube SOP** - Paste a YouTube URL, AI extracts frames and generates SOP
2. **Upload Video SOP** - Upload any video file for processing
3. **Live SOP** - Record directly from camera with real-time scene detection

### Technology
- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS
- **AI**: Google Gemini 2.0 Flash for fast video analysis
- **Backend**: Railway FFmpeg service for video processing
- **Database**: Supabase for SOP storage

## Quick Start

```bash
# Install dependencies
npm install

# Create .env file with your keys
cp .env.example .env
# Edit .env and add your API keys

# Start development server
npm run dev
```

## Environment Variables

Create a `.env` file with:
```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
API_KEY=your_gemini_api_key
```

## Project Structure

```
FrameOps/
├── components/          # React components
│   ├── SOPGenerator.tsx    # YouTube & Upload SOP
│   ├── LiveSOPGenerator.tsx # Live recording SOP
│   ├── SOPLibrary.tsx      # View saved SOPs
│   └── ...
├── services/            # API services
│   ├── geminiService.ts    # Gemini AI integration
│   ├── youtubeService.ts   # Railway backend calls
│   └── supabaseService.ts  # Database operations
├── App.tsx              # Main app component
└── types.ts             # TypeScript types
```

## Version

**v2.0.0-stable** - All 3 pipelines working

## License

Private - All rights reserved
