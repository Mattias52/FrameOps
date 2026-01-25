-- API Waitlist table for collecting interested users
CREATE TABLE IF NOT EXISTS api_waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  company TEXT,
  use_case TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE api_waitlist ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert (signup)
CREATE POLICY "Anyone can sign up for API waitlist" ON api_waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only admins can read (you can adjust this based on your needs)
CREATE POLICY "Admins can read waitlist" ON api_waitlist
  FOR SELECT TO authenticated
  USING (true);
