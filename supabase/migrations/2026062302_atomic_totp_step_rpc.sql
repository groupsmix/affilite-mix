-- Bug 8 (audit-round2-fixes): Atomic compare-and-set for the TOTP consumed
-- time-step (`admin_users.totp_last_step`).
--
-- Previously the login + step-up routes did a non-atomic read-then-write:
-- verify TOTP, then `updateAdminUser({ totp_last_step })`. Two concurrent
-- requests with the SAME valid 6-digit code both passed the single-use check
-- before either write persisted the new baseline, consuming the code twice
-- within its ~30s window — a NIST 800-63B §5.1.4.2 single-use OTP violation.
--
-- This RPC performs the compare-and-set in a single statement so only the
-- FIRST concurrent request can advance the baseline. The second sees zero
-- rows updated, which the caller treats as a replay rejection.
--
-- Semantics:
--   - totp_last_step IS NULL  → first use: accept and initialise the baseline.
--   - totp_last_step < step   → a newer step: accept and advance.
--   - totp_last_step >= step  → already consumed: zero rows updated → reject.
--
-- SECURITY DEFINER + pinned search_path: the caller is the service-role
-- client during auth, but pinning the search_path prevents a privilege-
-- escalation primitive via a mutable search_path (audit S-08 / G-CI-02).

CREATE OR REPLACE FUNCTION verify_and_set_totp_step(
  p_user_id uuid,
  p_expected_step bigint,
  p_new_step bigint
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_updated_count integer;
BEGIN
  UPDATE admin_users
  SET totp_last_step = p_new_step
  WHERE id = p_user_id
    AND (totp_last_step IS NULL OR totp_last_step < p_expected_step);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RETURN v_updated_count = 1;
END;
$$;

COMMENT ON FUNCTION verify_and_set_totp_step(uuid, bigint, bigint) IS
  'Bug 8: atomic compare-and-set on admin_users.totp_last_step. Returns true only when exactly one row advanced (first concurrent TOTP submission wins); false means the step was already consumed (replay).';

-- Lock the RPC to the service_role: only the privileged auth client should
-- mutate TOTP step state. anon/authenticated must never call it.
REVOKE ALL ON FUNCTION verify_and_set_totp_step(uuid, bigint, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION verify_and_set_totp_step(uuid, bigint, bigint) FROM anon;
REVOKE ALL ON FUNCTION verify_and_set_totp_step(uuid, bigint, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION verify_and_set_totp_step(uuid, bigint, bigint) TO service_role;
