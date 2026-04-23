-- F-31: TOTP recovery codes
-- This migration adds a totp_recovery_codes table to store backup codes
-- for users who have enabled 2FA, allowing account recovery if they lose
-- their TOTP device.

CREATE TABLE IF NOT EXISTS totp_recovery_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,  -- Hashed recovery code (bcrypt)
  used_at     TIMESTAMPTZ,    -- NULL if unused, timestamp if used
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);

-- Index for fast lookup by user_id
CREATE INDEX idx_totp_recovery_codes_user_id ON totp_recovery_codes(user_id);

-- Index for cleanup of used codes
CREATE INDEX idx_totp_recovery_codes_used_at ON totp_recovery_codes(used_at)
  WHERE used_at IS NOT NULL;

-- RLS policies
ALTER TABLE totp_recovery_codes ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role full access to totp_recovery_codes"
  ON totp_recovery_codes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Users can read their own recovery codes (for display during setup)
CREATE POLICY "Users can read own recovery codes"
  ON totp_recovery_codes FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT id FROM admin_users WHERE email = auth.jwt() ->> 'email')
  );

-- Users can insert their own recovery codes (during setup)
CREATE POLICY "Users can insert own recovery codes"
  ON totp_recovery_codes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT id FROM admin_users WHERE email = auth.jwt() ->> 'email')
  );

-- Users can update their own recovery codes (marking as used)
CREATE POLICY "Users can update own recovery codes"
  ON totp_recovery_codes FOR UPDATE
  TO authenticated
  USING (
    user_id = (SELECT id FROM admin_users WHERE email = auth.jwt() ->> 'email')
  )
  WITH CHECK (
    user_id = (SELECT id FROM admin_users WHERE email = auth.jwt() ->> 'email')
  );
