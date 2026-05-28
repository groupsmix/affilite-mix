-- Rollback 2026050106: Drop consent_log table
DROP INDEX IF EXISTS consent_log_subject_idx;
DROP TABLE IF EXISTS public.consent_log;
