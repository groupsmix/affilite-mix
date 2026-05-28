-- Rollback 2026052402: Re-grant increment_login_failed_attempts to public roles
-- WARNING: This weakens the security posture. Only apply in controlled environments.
GRANT EXECUTE ON FUNCTION increment_login_failed_attempts(UUID, INT, BIGINT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION increment_login_failed_attempts(UUID, INT, BIGINT) TO anon;
GRANT EXECUTE ON FUNCTION increment_login_failed_attempts(UUID, INT, BIGINT) TO authenticated;
