-- FrameOps Database Schema
-- Run this in Supabase SQL Editor (https://app.supabase.com → SQL Editor)

-- 1. Create SOPs table
CREATE TABLE IF NOT EXISTS sops (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  source_type TEXT NOT NULL DEFAULT 'upload',
  status TEXT NOT NULL DEFAULT 'completed',
  ppe_requirements TEXT[],
  materials_required TEXT[],
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  num_steps INTEGER DEFAULT 0,
  video_url TEXT,
  video_filename TEXT,
  metadata JSONB,
  thumbnail_url TEXT
);

-- 2. Create SOP Sections table (Steps)
CREATE TABLE IF NOT EXISTS sop_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sop_id TEXT NOT NULL REFERENCES sops(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_order INTEGER DEFAULT 0,
  timestamp TEXT,
  heading TEXT,
  content TEXT,
  title TEXT,
  description TEXT,
  image_path TEXT,
  thumbnail_url TEXT,
  safety_warnings TEXT[],
  tools_required TEXT[],
  quality_score FLOAT
);

-- 3. Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_sops_created_at ON sops(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sops_user_id ON sops(user_id);
CREATE INDEX IF NOT EXISTS idx_sop_sections_sop_id ON sop_sections(sop_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE sops ENABLE ROW LEVEL SECURITY;
ALTER TABLE sop_sections ENABLE ROW LEVEL SECURITY;

-- 5. Create policies for public access (no auth required for MVP)
-- For production, change these to require authentication

-- Allow anyone to read all SOPs
CREATE POLICY "Allow public read access on sops" ON sops
  FOR SELECT USING (true);

-- Allow anyone to insert SOPs
CREATE POLICY "Allow public insert access on sops" ON sops
  FOR INSERT WITH CHECK (true);

-- Allow anyone to delete SOPs
CREATE POLICY "Allow public delete access on sops" ON sops
  FOR DELETE USING (true);

-- Allow anyone to read all sections
CREATE POLICY "Allow public read access on sop_sections" ON sop_sections
  FOR SELECT USING (true);

-- Allow anyone to insert sections
CREATE POLICY "Allow public insert access on sop_sections" ON sop_sections
  FOR INSERT WITH CHECK (true);

-- Allow anyone to delete sections
CREATE POLICY "Allow public delete access on sop_sections" ON sop_sections
  FOR DELETE USING (true);

-- 6. Create storage bucket for thumbnails
-- Go to Storage in Supabase dashboard and create a bucket named "thumbnails"
-- Set it to PUBLIC for easy image access

-- Done! Your schema is ready.
