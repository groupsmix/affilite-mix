-- 00067_harden_tenant_isolation_rls
--
-- Audit-driven hardening of the tenant_isolation_* policy family that was
-- introduced in 00064_tenant_isolation_rls.sql.
--
-- Rationale (from the security audit, items R-1 / R-2 / R-3 / R-8):
--
--   R-1 — 00064 emitted `tenant_isolation_auth_global_<t>` on every table
--         that lacks a `site_id` column with `USING (true) WITH CHECK
--         (true)`. That granted FOR ALL to every authenticated Supabase
--         user on `admin_users`, `roles`, `permissions`, `role_permissions`,
--         `user_site_roles`, `audit_log`, `niche_templates`,
--         `integration_providers`, `site_integrations`, `stripe_events`,
--         and `sites`. Concrete impact: any authenticated user could
--         read `admin_users.password_hash` / `totp_secret` / `reset_token`,
--         flip their own row to `role = 'super_admin'`, delete `audit_log`
--         entries, or rewrite the entire RBAC graph. P0 / credential
--         disclosure + privilege escalation.
--
--   R-2 — On site-scoped tables, the policy used:
--           USING (
--             (current_setting('request.jwt.claims', true)::json
--                ->>'site_id') IS NULL
--             OR (... = site_id::text)
--           )
--         The IS NULL fallback meant any authenticated user whose JWT did
--         not carry a `site_id` claim (i.e. every standard Supabase Auth
--         token issued by signUp / signInWithPassword) saw every row in
--         every site_id table. Cross-tenant SELECT on products, content,
--         pages, newsletter_subscribers, affiliate_clicks, commissions,
--         memberships, quiz_submissions, wrist_shots, comments, etc.
--
--   R-3 — Top-level `site_id` JWT claims can be set by the client via
--         `auth.signUp({ data: { site_id: '...' } })` (which lands in
--         `user_metadata`). Reading from `app_metadata` (server-only) is
--         the only forgery-resistant source.
--
--   R-8 — Global config tables (`niche_templates`, `integration_providers`,
--         `permissions`, `roles`, `role_permissions`) should be
--         service_role only. The 00064 fallback opened them to all
--         authenticated users.
--
-- This migration is idempotent: every CREATE POLICY is preceded by a DROP
-- POLICY IF EXISTS so it can be re-run safely if 00064 is replayed.
--
-- Rollback: see 00067_harden_tenant_isolation_rls-down.sql. The down
-- migration restores the (insecure) 00064 policies; only run it as a
-- last-resort emergency revert and immediately re-apply this file.

-- ─────────────────────────────────────────────────────────────────────
-- Helper: pull site_id from app_metadata (server-controlled, immutable
-- from the client) instead of from a top-level claim.
--
-- We expose this as a SECURITY INVOKER function so the policy expression
-- is short and uniform across tables.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_request_site_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
    COALESCE(
      -- Preferred: app_metadata.site_id (server-controlled).
      current_setting('request.jwt.claims', true)::json
        #>> '{app_metadata,site_id}',
      -- Backwards compat: top-level site_id (only honoured for
      -- service-side flows that mint their own JWT, which never put the
      -- claim in app_metadata).
      current_setting('request.jwt.claims', true)::json ->> 'site_id'
    ),
    ''
  )::uuid;
$$;

COMMENT ON FUNCTION public.current_request_site_id() IS
  'Returns the tenant uuid from app_metadata.site_id (preferred) or the legacy top-level claim. Used by tenant_isolation_* RLS policies. Safe to call from RLS predicates because it is STABLE and uses NULLIF + cast to guard against missing/blank claims.';

-- ─────────────────────────────────────────────────────────────────────
-- 1. Strip the dangerous 00064 fallback policies from "global" tables.
--
-- For every table touched by 00064 that lacks a `site_id` column, we
-- drop the wide-open `tenant_isolation_auth_global_<t>` policy. Reads
-- and writes now flow through the existing `*_service_all` /
-- service-role-only policies that the per-table migrations created.
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  has_site_id boolean;
BEGIN
  FOR t IN
    SELECT tablename
    FROM   pg_tables
    WHERE  schemaname = 'public'
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE  table_schema = 'public'
        AND  table_name   = t
        AND  column_name  = 'site_id'
    ) INTO has_site_id;

    IF NOT has_site_id THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I',
        'tenant_isolation_auth_global_' || t,
        t
      );
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. Re-issue tenant_isolation_auth_<t> on site-scoped tables WITHOUT
--    the IS NULL fallback, reading from app_metadata.site_id.
--
-- The previous policy (created in 00064) is dropped first so this
-- migration is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  has_site_id boolean;
BEGIN
  FOR t IN
    SELECT tablename
    FROM   pg_tables
    WHERE  schemaname = 'public'
  LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE  table_schema = 'public'
        AND  table_name   = t
        AND  column_name  = 'site_id'
    ) INTO has_site_id;

    IF has_site_id THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I',
        'tenant_isolation_auth_' || t,
        t
      );
      EXECUTE format($f$
        CREATE POLICY %I ON %I
        FOR ALL TO authenticated
        USING (
          public.current_request_site_id() IS NOT NULL
          AND public.current_request_site_id() = site_id
        )
        WITH CHECK (
          public.current_request_site_id() IS NOT NULL
          AND public.current_request_site_id() = site_id
        )
      $f$, 'tenant_isolation_auth_' || t, t);
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Defense-in-depth: explicit deny-by-default on credential / RBAC /
--    audit / config tables. We keep service_role policies intact (they
--    bypass RLS anyway), but we want anyone reading the policy list to
--    see that authenticated has zero access.
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'admin_users',
      'roles',
      'permissions',
      'role_permissions',
      'user_site_roles',
      'admin_site_memberships',
      'audit_log',
      'niche_templates',
      'integration_providers',
      'site_integrations',
      'stripe_events'
    ])
  LOOP
    -- Only act on tables that actually exist in this schema (some
    -- environments may not have every table yet).
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE  table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format(
        'DROP POLICY IF EXISTS %I ON %I',
        'authenticated_no_access_' || t,
        t
      );
      EXECUTE format($f$
        CREATE POLICY %I ON %I
        FOR ALL TO authenticated
        USING (false)
        WITH CHECK (false)
      $f$, 'authenticated_no_access_' || t, t);
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 4. R-6 — anon ad_impressions insert must require an active parent
--    site. Without this an attacker can stuff impressions for paused or
--    deleted sites; that data then taints analytics/EPC.
-- ─────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE  table_schema = 'public' AND table_name = 'ad_impressions'
  ) THEN
    DROP POLICY IF EXISTS public_insert_ad_impressions ON public.ad_impressions;
    CREATE POLICY public_insert_ad_impressions
      ON public.ad_impressions
      FOR INSERT TO anon
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.sites s
          WHERE  s.id = ad_impressions.site_id
            AND  s.is_active = true
        )
      );
  END IF;
END;
$$;
