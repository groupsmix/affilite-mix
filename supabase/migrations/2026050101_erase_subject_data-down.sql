-- Rollback 2026050101: Drop erase_subject_data RPC
DROP FUNCTION IF EXISTS public.erase_subject_data(text, uuid, text);
