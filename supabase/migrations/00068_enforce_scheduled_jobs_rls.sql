-- ═══════════════════════════════════════════════════════
-- Migration 00068: Enforce RLS on scheduled_jobs
-- ═══════════════════════════════════════════════════════
--
-- Live-audit finding LIVE-12: a sweep of pg_class.relrowsecurity on the
-- staging Supabase project (bmoyiluixhqqdceqxhpi) showed 44 of 45 public
-- tables with RLS enabled — `scheduled_jobs` was the lone outlier with
-- `relrowsecurity = false`. Production currently has the flag on, but
-- there is no migration in the tree that asserts it; the schema is
-- documented in `supabase/schema.sql` but `schema.sql` is a snapshot
-- and is intentionally NOT applied as a migration (see README §3).
-- That means a fresh Supabase project bootstrapped from migrations
-- alone (e.g. when a new staging or DR project is provisioned) ends
-- up with `scheduled_jobs` exposed to any role.
--
-- Why this matters: `scheduled_jobs` carries `site_id`, `target_id`,
-- and arbitrary `payload` jsonb for every site. Without RLS, an
-- authenticated Supabase JWT can SELECT/INSERT/UPDATE/DELETE rows
-- across every tenant — bypassing the cross-tenant isolation the rest
-- of the schema relies on (00067 hardening, lib/dal/scheduled-jobs.ts
-- assumes service-role-only writes).
--
-- This migration is idempotent and safe to re-run:
--   * `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` is a no-op when RLS
--     is already on.
--   * `FORCE ROW LEVEL SECURITY` ensures the table owner is also
--     subject to policies (defense-in-depth against accidental
--     superuser DML from the Supabase SQL editor).
--   * The service-role policy uses the same shape as the
--     `service_full_access_*` family from 00020 so behaviour is
--     unchanged for the cron path that does
--     `getPrivilegedSupabaseClient()` writes.
--
-- Rollback: see 00068_enforce_scheduled_jobs_rls-down.sql. The down
-- migration disables FORCE RLS (NOT the RLS flag itself, which would
-- re-open the cross-tenant gap) and drops the policy.
--
-- ═══════════════════════════════════════════════════════

-- 1. Ensure RLS is enabled. No-op when already on; raises the flag
--    on environments that drifted (LIVE-12).
ALTER TABLE scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- 2. Force RLS so the table owner role also has policies applied.
--    Without FORCE, owner-role DDL/DML in the Supabase SQL editor
--    bypasses every policy below.
ALTER TABLE scheduled_jobs FORCE ROW LEVEL SECURITY;

-- 3. Re-assert the service-role policy from 00020. CREATE POLICY is
--    not idempotent on its own, so we DROP-IF-EXISTS first. This is
--    the only policy expected on the table — application code talks
--    to scheduled_jobs exclusively through the privileged Supabase
--    client (lib/dal/scheduled-jobs.ts).
DROP POLICY IF EXISTS "service_full_access_scheduled_jobs" ON scheduled_jobs;
CREATE POLICY "service_full_access_scheduled_jobs" ON scheduled_jobs
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
