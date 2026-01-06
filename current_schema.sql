-- FrameOps Database Schema (Current)
-- This file documents the expected database schema
-- Run the migration file in supabase/migrations/ to create these tables

-- Tables:
-- 1. sops - Main SOP records
-- 2. sop_steps - Individual steps within each SOP

-- Table: sops
-- Columns:
--   id TEXT PRIMARY KEY
--   title TEXT NOT NULL
--   description TEXT
--   created_at TIMESTAMPTZ DEFAULT NOW()
--   source_type TEXT NOT NULL DEFAULT 'upload'
--   status TEXT NOT NULL DEFAULT 'completed'
--   ppe_requirements TEXT[]
--   materials_required TEXT[]
--   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE

-- Table: sop_steps
-- Columns:
--   id TEXT PRIMARY KEY
--   sop_id TEXT NOT NULL REFERENCES sops(id) ON DELETE CASCADE
--   step_order INTEGER NOT NULL DEFAULT 0
--   timestamp TEXT
--   title TEXT NOT NULL
--   description TEXT NOT NULL
--   thumbnail_url TEXT
--   safety_warnings TEXT[]
--   tools_required TEXT[]

-- Storage:
-- Bucket: thumbnails (PUBLIC)
-- Structure: {sop_id}/{step_id}.jpg
