-- ═══════════════════════════════════════════════════════════════════
-- Migration 00083 (audit S-09): lock down public._migrations_applied
-- ═══════════════════════════════════════════════════════════════════
--
-- Background
-- ----------
-- `public._migrations_applied` is the ledger the deploy pipeline
-- consults via `psql` to decide which `supabase/migrations/*.sql`
-- files to apply (see `.github/workflows/deploy.yml`). Treat it as
-- privileged-only state.
--
-- The audit (S-09) flagged that the table currently carries
-- `tenant_isolation_auth_global__migrations_applied` with
-- `USING (true) WITH CHECK (true) FOR ALL TO authenticated` — a side
-- effect of 00064 having a generic fallback for tables without
-- `site_id`. Combined with the public Supabase Auth signup that
-- S-03 disables, an attacker could:
--
--   * INSERT a fake row claiming `00067_harden_tenant_isolation_rls.sql`
--     was applied → next deploy skips the hardening migration entirely.
--   * DELETE existing rows → next deploy re-applies migrations on top
--     of a database that already has the schema, often producing
--     duplicate-object errors that abort mid-way and leave the DB in
--     an inconsistent state.
--
-- Strategy
-- --------
-- Drop the wide-open policy, REVOKE all grants from `anon` /
-- `authenticated`, and add an explicit service_role-only policy. The
-- deploy job uses the direct DB URL (which connects as `postgres` /
-- bypasses RLS for the superuser session anyway), so this does not
-- affect the migration flow.
--
-- Idempotent.

DO $$
BEGIN
  IF to_regclass('public._migrations_applied') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public._migrations_applied ENABLE ROW LEVEL SECURITY';
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_auth_global__migrations_applied ON public._migrations_applied';
    EXECUTE 'DROP POLICY IF EXISTS _migrations_applied_service_all ON public._migrations_applied';
    EXECUTE 'REVOKE ALL ON public._migrations_applied FROM anon, authenticated';
    EXECUTE 'GRANT  SELECT, INSERT, UPDATE, DELETE ON public._migrations_applied TO service_role';

    -- Defense-in-depth: a service-role-only RLS policy so even if a
    -- future migration accidentally re-grants the table to a wider
    -- role, the policy still blocks reads/writes from non-service.
    EXECUTE $POLICY$
      CREATE POLICY _migrations_applied_service_all
        ON public._migrations_applied
        FOR ALL
        TO service_role
        USING ((select auth.role()) = 'service_role')
        WITH CHECK ((select auth.role()) = 'service_role')
    $POLICY$;
  END IF;
END;
$$;
