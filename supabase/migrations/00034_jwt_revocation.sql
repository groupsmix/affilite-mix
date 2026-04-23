-- F-06: JWT revocation via jti + revocation table
-- This migration adds a jwt_revocations table to track revoked JWT tokens
-- using their jti (JWT ID) claim for logout and session invalidation.

CREATE TABLE IF NOT EXISTS jwt_revocations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jti          TEXT NOT NULL UNIQUE,  -- JWT ID from the token
  user_id      UUID NOT NULL,         -- User who owns the token
  revoked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,  -- When the JWT would have expired naturally
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by jti (used during token validation)
CREATE INDEX idx_jwt_revocations_jti ON jwt_revocations(jti);

-- Index for user-specific revocation lookups
CREATE INDEX idx_jwt_revocations_user_id ON jwt_revocations(user_id);

-- Index for cleanup of expired revocations
CREATE INDEX idx_jwt_revocations_expires_at ON jwt_revocations(expires_at);

-- RLS policies
ALTER TABLE jwt_revocations ENABLE ROW LEVEL SECURITY;

-- Service role can insert (logout endpoint)
CREATE POLICY "Service role can insert revocations"
  ON jwt_revocations FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Service role can read (for token validation)
CREATE POLICY "Service role can read revocations"
  ON jwt_revocations FOR SELECT
  TO service_role
  USING (true);

-- Prevent any other access
CREATE POLICY "No other access to jwt_revocations"
  ON jwt_revocations FOR ALL
  TO authenticated, anon
  USING (false);

-- Function to clean up expired revocations
CREATE OR REPLACE FUNCTION cleanup_expired_jwt_revocations()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM jwt_revocations
  WHERE expires_at < now();
END;
$$;
