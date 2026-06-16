-- 00068_enforce_scheduled_jobs_rls-down
--
-- Reverts the FORCE RLS flag and drops the service-role policy
-- created by 00068. Intentionally does NOT disable RLS itself —
-- `scheduled_jobs` MUST remain RLS-enabled in every environment to
-- preserve cross-tenant isolation (LIVE-12). If a future change
-- needs to disable RLS, do it in a dedicated migration with an
-- explicit risk acceptance.

ALTER TABLE scheduled_jobs NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_full_access_scheduled_jobs" ON scheduled_jobs;
