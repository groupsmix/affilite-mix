-- Rollback 2026052203: Drop webhook_dlq table
DROP INDEX IF EXISTS idx_webhook_dlq_event_id;
DROP INDEX IF EXISTS idx_webhook_dlq_status_created;
DROP TABLE IF EXISTS webhook_dlq;
