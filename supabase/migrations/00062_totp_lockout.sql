-- Add TOTP lockout columns to admin_users table
ALTER TABLE public.admin_users 
ADD COLUMN IF NOT EXISTS totp_failed_attempts INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS totp_locked_until TIMESTAMPTZ;
