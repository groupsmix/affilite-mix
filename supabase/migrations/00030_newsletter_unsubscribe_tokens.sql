-- Migration: Add dedicated opaque unsubscribe tokens to newsletter_subscribers.
-- The GET /api/newsletter/unsubscribe endpoint previously used the subscriber
-- primary key (UUID) as the unsubscribe token, which is an information-disclosure
-- risk.  This migration adds a separate per-row token that is rotated on each
-- subscription or re-subscription event.

ALTER TABLE newsletter_subscribers
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid UNIQUE DEFAULT gen_random_uuid();

-- Index for fast O(1) token lookups on unsubscribe
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_subscribers_unsubscribe_token
  ON newsletter_subscribers (unsubscribe_token)
  WHERE unsubscribe_token IS NOT NULL;

-- Backfill: ensure all existing rows have a token
UPDATE newsletter_subscribers
  SET unsubscribe_token = gen_random_uuid()
  WHERE unsubscribe_token IS NULL;
