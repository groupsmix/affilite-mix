-- Rollback 2026050102: Drop subject_restrictions table
DROP POLICY IF EXISTS subject_restrictions_service_only ON public.subject_restrictions;
DROP INDEX IF EXISTS subject_restrictions_active_idx;
DROP TABLE IF EXISTS public.subject_restrictions;
