-- F-02: Stripe webhook idempotency
-- This migration adds a stripe_events table to track processed webhooks
-- and prevent duplicate processing of the same event.

CREATE TABLE IF NOT EXISTS stripe_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    TEXT NOT NULL UNIQUE,  -- Stripe event ID (evt_*)
  event_type  TEXT NOT NULL,         -- e.g., checkout.session.completed
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookup by event_id
CREATE INDEX idx_stripe_events_event_id ON stripe_events(event_id);

-- Index for cleanup of old processed events
CREATE INDEX idx_stripe_events_processed_at ON stripe_events(processed_at);

-- RLS policies
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- Only service role can insert (webhook handler)
CREATE POLICY "Service role can insert stripe events"
  ON stripe_events FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Only service role can read (for idempotency checks)
CREATE POLICY "Service role can read stripe events"
  ON stripe_events FOR SELECT
  TO service_role
  USING (true);

-- Prevent any other access
CREATE POLICY "No other access to stripe_events"
  ON stripe_events FOR ALL
  TO authenticated, anon
  USING (false);
