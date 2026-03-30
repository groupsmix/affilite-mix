-- Migration: Add double opt-in columns to newsletter_subscribers
-- Adds confirmation_token and confirmed_at for GDPR/CAN-SPAM compliance.

ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS confirmation_token uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz DEFAULT NULL;

-- Index for fast token lookups during confirmation
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_confirmation_token
  ON newsletter_subscribers (confirmation_token)
  WHERE confirmation_token IS NOT NULL;

-- Backfill: mark all existing "active" subscribers as confirmed
UPDATE newsletter_subscribers
  SET confirmed_at = created_at
  WHERE status = 'active' AND confirmed_at IS NULL;
