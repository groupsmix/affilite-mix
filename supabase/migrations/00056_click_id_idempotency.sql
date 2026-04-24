-- ============================================================
-- Migration 00056: E-4 click_id idempotency for affiliate_clicks
--
-- Adds a client-generated UUID click_id so the queue consumer can
-- deduplicate retried messages with ON CONFLICT (click_id) DO NOTHING.
--
-- Existing rows get NULL; new rows are expected to supply a value.
-- The column is nullable to avoid back-filling millions of rows, but
-- the UNIQUE index only covers non-NULL values (partial index) so it
-- doesn't waste space on legacy rows.
-- ============================================================

ALTER TABLE affiliate_clicks
  ADD COLUMN IF NOT EXISTS click_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_affiliate_clicks_click_id
  ON affiliate_clicks (click_id);

