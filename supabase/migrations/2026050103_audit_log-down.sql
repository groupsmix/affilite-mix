-- Rollback 2026050103: Drop audit_log table
-- WARNING: This permanently deletes all audit history. Use only for
-- clean-room rollback on a non-production database.
DROP POLICY IF EXISTS audit_log_service_insert ON public.audit_log;
DROP INDEX IF EXISTS audit_log_action_created_idx;
DROP TABLE IF EXISTS public.audit_log;
