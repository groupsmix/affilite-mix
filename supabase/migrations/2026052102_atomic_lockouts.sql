-- ============================================================
-- Migration 2026052102: Atomic lockout increments
--
-- Fixes A10/A18 TOCTOU races by executing lockout increments
-- completely atomically in the database layer.
-- ============================================================

CREATE OR REPLACE FUNCTION increment_admin_login_attempts(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE admin_users
  SET login_failed_attempts = login_failed_attempts + 1,
      login_locked_until = CASE 
        WHEN login_failed_attempts + 1 >= 10 THEN (now() + interval '1 hour')
        ELSE login_locked_until 
      END
  WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION increment_admin_totp_attempts(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE admin_users
  SET totp_failed_attempts = totp_failed_attempts + 1,
      totp_locked_until = CASE 
        WHEN totp_failed_attempts + 1 >= 10 THEN (now() + interval '1 hour')
        ELSE totp_locked_until 
      END
  WHERE id = p_user_id;
$$;

-- ROLLBACK:
-- DROP FUNCTION IF EXISTS increment_admin_login_attempts(uuid);
-- DROP FUNCTION IF EXISTS increment_admin_totp_attempts(uuid);
