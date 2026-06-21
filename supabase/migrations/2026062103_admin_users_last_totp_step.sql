-- T1-F4 / NIST 800-63B §5.1.4.2: TOTP single-use anti-replay.
--
-- PROBLEM: verifyTotpToken() returned delta !== null but callers never persisted
-- the time-step, so the same 6-digit code could be replayed across its full
-- ~90-second validity window (window:1 = ±1 step of 30s). The 5-attempt/5-min
-- rate limiter was the only control — replay within one burst was unthrottled.
--
-- FIX: persist the last-accepted time-step per user. The auth paths do a
-- conditional UPDATE (WHERE last_totp_step IS NULL OR last_totp_step < :step)
-- before granting the session. If 0 rows are updated, the step was already
-- consumed and the login is rejected as a replay.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS last_totp_step BIGINT;

COMMENT ON COLUMN admin_users.last_totp_step IS
  'T1-F4: The TOTP time-step last accepted for this user '
  '(integer counter = unix_seconds / 30). NULL = no code accepted yet. '
  'A code is rejected when its step <= this value (single-use OTP, '
  'NIST 800-63B §5.1.4.2). Updated atomically on each successful TOTP '
  'verification via a conditional UPDATE (WHERE last_totp_step IS NULL '
  'OR last_totp_step < :new_step) to prevent race-condition replays.';
