-- R-03: Durable Stripe webhook DLQ table.
-- Failed webhook events are persisted here instead of only being logged,
-- enabling replay tooling and reconciliation reports.
CREATE TABLE IF NOT EXISTS stripe_event_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  attempts integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);

-- Index for replay tooling (find unresolved failures)
CREATE INDEX idx_stripe_event_failures_unresolved
  ON stripe_event_failures (created_at DESC)
  WHERE resolved_at IS NULL;

-- Prevent duplicate entries for the same Stripe event
CREATE UNIQUE INDEX idx_stripe_event_failures_event_id
  ON stripe_event_failures (event_id);

-- RLS: Only service role can access this table
ALTER TABLE stripe_event_failures ENABLE ROW LEVEL SECURITY;
