-- Rollback 00065: Remove actor_user_id from audit_log
DROP INDEX IF EXISTS idx_audit_log_actor_user_id;
ALTER TABLE audit_log DROP COLUMN IF EXISTS actor_user_id;
