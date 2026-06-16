-- Rollback 2026052202: Drop stripe_event_failures table
DROP INDEX IF EXISTS idx_stripe_event_failures_event_id;
DROP INDEX IF EXISTS idx_stripe_event_failures_unresolved;
DROP TABLE IF EXISTS stripe_event_failures;
