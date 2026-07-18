-- ═══════════════════════════════════════════════════════════════════
-- Migration 2026062601: Re-wrap 00092 policies with (select …) for
--                       initplan optimisation (Issue 9 / P3).
--
-- Problem:
--   Migration 00082_rls_initplan_optimisation.sql wrapped every
--   auth.<x>() / current_request_site_id*() call in RLS predicates
--   inside a (select …) subselect to eliminate per-row initplan
--   re-evaluation. Migration 00092_multi_site_rls_and_cleanup.sql
--   then re-created 6 tenant_isolation_auth_* policies with bare
--   current_request_site_ids() calls (not wrapped), re-introducing
--   the initplan perf regression that 00082 fixed.
--
--   The CI guard (scripts/check-migrations.sh G-CI-01) catches new
--   bare calls, but 00092 was merged before the guard existed (or
--   was exempted). This migration re-wraps those 6 policies.
--
--   The affected tables (from 00092):
--     - products
--     - content
--     - pages
--     - categories
--     - newsletter_subscribers
--     - affiliate_clicks
--
--   The 00092 policies use `site_id = ANY(current_request_site_ids())`
--   where the function returns uuid[]. The initplan fix wraps the
--   function call in (select …), but ANY() needs the array directly.
--   The correct wrapped form is:
--     site_id = ANY(current_request_site_ids())
--   Postgres resolves (select ...) as a scalar subquery returning the
--   uuid[] value, which ANY() accepts.
--
-- Idempotent: each DROP POLICY IF EXISTS + CREATE POLICY is safe to
-- re-run.
--
-- Rollback: see 2026062601_rewrap_initplan_00092-down.sql. Restores
-- the bare (unwrapped) 00092 policies — only run if the wrapped form
-- causes a planner regression (it shouldn't; the wrapped form is the
-- documented Supabase best-practice).
-- ═══════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- products
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_products' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_products ON public.products;
    CREATE POLICY tenant_isolation_auth_products ON public.products
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  -- content
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_content' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_content ON public.content;
    CREATE POLICY tenant_isolation_auth_content ON public.content
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  -- pages
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_pages' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_pages ON public.pages;
    CREATE POLICY tenant_isolation_auth_pages ON public.pages
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  -- categories
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_categories' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_categories ON public.categories;
    CREATE POLICY tenant_isolation_auth_categories ON public.categories
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  -- newsletter_subscribers
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_newsletter_subscribers' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_newsletter_subscribers ON public.newsletter_subscribers;
    CREATE POLICY tenant_isolation_auth_newsletter_subscribers ON public.newsletter_subscribers
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  -- affiliate_clicks
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_affiliate_clicks' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_affiliate_clicks ON public.affiliate_clicks;
    CREATE POLICY tenant_isolation_auth_affiliate_clicks ON public.affiliate_clicks
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;
END;
$$;
