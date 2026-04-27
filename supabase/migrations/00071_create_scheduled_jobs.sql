-- ═══════════════════════════════════════════════════════
-- LIVE-05 follow-up: canonical scheduled_jobs table
-- ═══════════════════════════════════════════════════════
-- Earlier migrations (00003, 00020, 00024, 00068) reference the
-- scheduled_jobs table for RLS policies and indexes, but no migration
-- in the chain actually creates it — the table only existed in the
-- legacy supabase/schema.sql. Fresh DB replays therefore failed in
-- 00003 with: relation "scheduled_jobs" does not exist.
--
-- This migration creates the table if missing, then re-applies the
-- RLS configuration and supporting indexes that the earlier guarded
-- DO blocks would have skipped on a fresh DB.
--
-- It is safe to run on production: every statement is idempotent
-- (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP
-- POLICY IF EXISTS).
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id       uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  job_type      text NOT NULL
                CHECK (job_type IN ('publish_content', 'activate_product', 'archive_content', 'archive_product', 'custom')),
  target_id     uuid NOT NULL,
  scheduled_for timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'executed', 'failed', 'cancelled')),
  payload       jsonb DEFAULT '{}',
  executed_at   timestamptz,
  error         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_site
  ON scheduled_jobs(site_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_pending
  ON scheduled_jobs(scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_site_status
  ON scheduled_jobs(site_id, status, scheduled_for);

-- Re-apply the service-role policy that 00003 / 00020 skipped via
-- their to_regclass guards on fresh DBs.
DROP POLICY IF EXISTS "service_full_access_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "service_full_access_scheduled_jobs" ON scheduled_jobs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
