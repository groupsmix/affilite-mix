-- ════════════════════════════════════════════════════
-- ADMIN USERS — per-user admin accounts
-- ════════════════════════════════════════════════════
-- Run this migration against your Supabase database to enable
-- per-user admin accounts.

CREATE TABLE IF NOT EXISTS admin_users (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email       text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name        text NOT NULL DEFAULT '',
  role        text NOT NULL DEFAULT 'admin'
              CHECK (role IN ('admin', 'super_admin')),
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- Index for login lookups
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- Auto-update updated_at
CREATE TRIGGER admin_users_updated_at
  BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: admin_users is server-only (service key), no public access
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
