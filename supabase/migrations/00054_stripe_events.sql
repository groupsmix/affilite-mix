-- ============================================================
-- Migration 00054: Stripe webhook idempotency
-- Audit F-001 (A-1) — record each processed Stripe event id so that
-- replayed webhooks (Stripe retries on non-2xx) never apply the same
-- side effect twice.
-- ============================================================

CREATE TABLE IF NOT EXISTS stripe_events (
  stripe_event_id TEXT PRIMARY KEY,
  event_type      TEXT NOT NULL,
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_received_at
  ON stripe_events (received_at DESC);

-- RLS: only the service role may read/write (no public access).
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_stripe_events" ON stripe_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
