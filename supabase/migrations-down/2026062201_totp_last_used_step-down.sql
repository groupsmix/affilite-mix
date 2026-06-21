-- Down migration for 2026062201_totp_last_used_step
--
-- Reverts the F4 audit fix: removes the totp_last_step replay-protection
-- baseline column. Dropping the column restores the prior behaviour where a
-- TOTP code was replayable within its ~90s window. Safe to revert — the
-- application treats a missing/NULL baseline as "no replay check", so reads
-- continue to function (verifyTotpToken simply skips the step comparison).

ALTER TABLE public.admin_users
  DROP COLUMN IF EXISTS totp_last_step;
