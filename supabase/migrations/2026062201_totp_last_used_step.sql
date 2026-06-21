-- F4 audit fix: persist the highest consumed TOTP time-step so replays within
-- the ~90s window (window:1 = 3 steps of 30s) are rejected. Closes a NIST
-- 800-63B §5.1.4.2 single-use OTP gap that previously allowed a captured
-- code to be replayed for up to 90 seconds.
--
-- The step value is the OTPAuth time counter (floor(unix_ts / 30) + delta),
-- monotonically increasing per secret. We compare strictly greater-than on
-- persist so legitimate forward drift never locks out the user.
--
-- NULL on existing rows means "no TOTP code has been consumed yet" — those
-- rows keep working as before (no replay-check baseline = no replay to
-- reject). This is intentional: a NULL baseline must not block first use.

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS totp_last_step BIGINT;

COMMENT ON COLUMN public.admin_users.totp_last_step IS
  'F4 audit: highest TOTP time-step (floor(unix_ts/30) + delta) successfully consumed. Strictly greater-than on persist; NULL = no baseline yet.';
