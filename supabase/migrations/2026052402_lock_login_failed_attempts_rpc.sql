-- SP-003 / RC-001: Restrict increment_login_failed_attempts to service_role only.
-- Prevents authenticated clients from incrementing another user's lockout counter.

REVOKE ALL ON FUNCTION increment_login_failed_attempts(UUID, INT, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION increment_login_failed_attempts(UUID, INT, BIGINT) FROM anon;
REVOKE ALL ON FUNCTION increment_login_failed_attempts(UUID, INT, BIGINT) FROM authenticated;

GRANT EXECUTE ON FUNCTION increment_login_failed_attempts(UUID, INT, BIGINT) TO service_role;
