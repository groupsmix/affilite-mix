-- LIVE-05 follow-up rollback.
-- Only drop the policy/indexes; never drop the table from a -down
-- migration since prod data lives there.
DROP POLICY IF EXISTS "service_full_access_scheduled_jobs" ON scheduled_jobs;
DROP INDEX IF EXISTS idx_scheduled_jobs_site_status;
DROP INDEX IF EXISTS idx_scheduled_jobs_pending;
DROP INDEX IF EXISTS idx_scheduled_jobs_site;
