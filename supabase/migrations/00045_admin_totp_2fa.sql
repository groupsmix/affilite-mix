-- Admin TOTP 2FA — adds columns for TOTP secret and enrollment status.

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS totp_secret TEXT,
  ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS totp_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN admin_users.totp_secret IS
  'Encrypted TOTP secret for 2FA. NULL when 2FA is not enrolled.';
COMMENT ON COLUMN admin_users.totp_enabled IS
  'Whether TOTP 2FA is enabled and verified for this admin user.';
COMMENT ON COLUMN admin_users.totp_verified_at IS
  'Timestamp when TOTP was last verified during enrollment.';
