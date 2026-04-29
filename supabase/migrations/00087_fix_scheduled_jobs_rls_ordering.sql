-- DB-07: Fix migration ordering for scheduled_jobs RLS.
--
-- Problem: 00068 runs ALTER TABLE scheduled_jobs ENABLE/FORCE ROW LEVEL
-- SECURITY un-guarded, but the canonical CREATE TABLE scheduled_jobs
-- lives in 00071. A fresh replay (new staging / DR rebuild) errors at
-- 00068 because the table does not exist yet.
--
-- Fix: Re-assert the same RLS hardening from 00068 here, after 00071
-- has guaranteed the table exists. This makes fresh replays safe while
-- existing environments (where 00068 already ran successfully) get a
-- harmless no-op.

DO $$
BEGIN
  IF to_regclass('public.scheduled_jobs') IS NOT NULL THEN
    -- Ensure RLS is enabled (idempotent)
    ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;
    -- Force RLS on table owner too
    ALTER TABLE scheduled_jobs FORCE ROW LEVEL SECURITY;
  END IF;
END $$;
