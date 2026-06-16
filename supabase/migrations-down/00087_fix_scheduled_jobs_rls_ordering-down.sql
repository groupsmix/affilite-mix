-- Rollback 00087: undo scheduled_jobs RLS re-assertion.
-- This does NOT remove RLS if it was already enabled by 00068.
DO $$
BEGIN
  IF to_regclass('public.scheduled_jobs') IS NOT NULL THEN
    ALTER TABLE scheduled_jobs NO FORCE ROW LEVEL SECURITY;
  END IF;
END $$;
