-- Migration: Add reset_token columns to admin_users table
-- The forgot-password and reset-password flows reference these columns
-- but they are missing from the admin_users table schema.

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS reset_token text;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS reset_token_expires_at timestamptz;
