-- FrameOps API Keys Migration
-- Run this in your Supabase SQL editor

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  key VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) DEFAULT 'Default API Key',
  is_active BOOLEAN DEFAULT true,
  rate_limit INTEGER DEFAULT 10,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- API Usage tracking table
CREATE TABLE IF NOT EXISTS api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  request_size INTEGER,
  ip_address VARCHAR(45),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster usage queries
CREATE INDEX IF NOT EXISTS idx_api_usage_user_created
ON api_usage(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_api_usage_key_created
ON api_usage(api_key_id, created_at);

CREATE INDEX IF NOT EXISTS idx_api_keys_key
ON api_keys(key);

-- Function to generate API key
CREATE OR REPLACE FUNCTION generate_api_key()
RETURNS VARCHAR(64) AS $$
DECLARE
  key VARCHAR(64);
BEGIN
  key := 'fops_' || encode(gen_random_bytes(28), 'hex');
  RETURN key;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate API key on insert
CREATE OR REPLACE FUNCTION set_api_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.key IS NULL THEN
    NEW.key := generate_api_key();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_api_key
BEFORE INSERT ON api_keys
FOR EACH ROW
EXECUTE FUNCTION set_api_key();

-- RLS Policies
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Users can only see their own API keys
CREATE POLICY "Users can view own API keys" ON api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own API keys" ON api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own API keys" ON api_keys
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own API keys" ON api_keys
  FOR DELETE USING (auth.uid() = user_id);

-- Users can view their own usage
CREATE POLICY "Users can view own usage" ON api_usage
  FOR SELECT USING (auth.uid() = user_id);

-- Service role can do everything (for backend)
CREATE POLICY "Service role full access to api_keys" ON api_keys
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access to api_usage" ON api_usage
  FOR ALL USING (auth.role() = 'service_role');

-- Add plan column to users if not exists (or use profiles table)
-- ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS plan VARCHAR(20) DEFAULT 'free';

-- Sample data for testing (optional)
-- INSERT INTO api_keys (user_id, name) VALUES ('your-user-id', 'Test Key');
