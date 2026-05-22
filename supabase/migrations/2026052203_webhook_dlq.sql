-- R2-02: Create durable Dead Letter Queue table for failed Stripe webhook events.
-- Used by lib/dal/webhook-dlq.ts for replay tooling and reconciliation.

CREATE TABLE IF NOT EXISTS webhook_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  error_message TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'replayed', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Index for replay tooling: find unresolved events quickly
CREATE INDEX IF NOT EXISTS idx_webhook_dlq_status_created
  ON webhook_dlq (status, created_at DESC)
  WHERE status = 'pending';

-- Index for event lookup by Stripe event ID
CREATE INDEX IF NOT EXISTS idx_webhook_dlq_event_id
  ON webhook_dlq (event_id);

-- Retention policy: auto-purge resolved entries older than 90 days
-- (Implemented as a scheduled cron job, not a DB trigger, to avoid lock contention)
COMMENT ON TABLE webhook_dlq IS
  'Durable DLQ for failed Stripe webhook events. Resolved entries older than 90 days may be purged by the retention cron.';
