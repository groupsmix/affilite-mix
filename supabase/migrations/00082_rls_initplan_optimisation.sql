-- ═══════════════════════════════════════════════════════════════════
-- Migration 00082 (audit S-07): wrap auth.<x>() / current_request_site_id()
--                               in `(select …)` to fix initplan re-evaluation
-- ═══════════════════════════════════════════════════════════════════
--
-- Background
-- ----------
-- Supabase performance advisor `auth_rls_initplan` (lint 0003) flags
-- 64 policies that call `auth.uid()` / `auth.role()` / `auth.jwt()` /
-- `public.current_request_site_id()` directly inside RLS predicates.
-- Postgres re-evaluates these calls per-row instead of once-per-query
-- because the planner can't prove they are constant within the query.
-- At ≥ ~10× current row counts on `affiliate_clicks`, `web_vitals`,
-- `experiment_events`, etc. this turns p99 reads/writes into multi-
-- second scans.
--
-- The canonical Supabase fix is to wrap each call in a subselect:
--
--     USING ( site_id = current_request_site_id() )
--   →
--     USING ( site_id = (select current_request_site_id()) )
--
-- Postgres then evaluates the subselect once and caches the value as
-- an InitPlan, eliminating the per-row call cost.
--
-- Strategy
-- --------
-- Rather than enumerate the 64 policy names (which differ across
-- staging / prod and would drift again on the next CREATE POLICY),
-- this migration walks `pg_policies` and rewrites every public-schema
-- policy whose `qual` or `with_check` references `auth.<x>()` or
-- `current_request_site_id()` outside a `(select …)` wrapper. We
-- DROP and re-CREATE each affected policy with the wrapped form,
-- preserving its name, role list, command (FOR ALL/SELECT/...), and
-- permissive/restrictive flag.
--
-- Idempotent: a second apply is a no-op because the rewritten
-- predicate already contains `(select …)`. The collapse step at the
-- bottom guards against any historical double-wrapping.
--
-- Cross-references: G-CI-01 adds a CI lint that fails new migrations
-- which reintroduce a bare `auth.<x>()` / `current_request_site_id()`
-- inside CREATE POLICY, so this hardening doesn't regress.
--
-- Rollback: see 00082_rls_initplan_optimisation-down.sql, which
-- unwraps the subselects. Only run that if Postgres' planner
-- regresses on the wrapped form (it shouldn't) — the wrapped form is
-- the documented best-practice.

CREATE OR REPLACE FUNCTION pg_temp.__wrap_initplan(input text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result text := input;
BEGIN
  IF result IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1. Wrap each direct auth.<x>() / helper call. The naive replace
  --    may double-wrap an already-wrapped call; step 2 collapses that.
  result := regexp_replace(result, 'auth\.uid\(\)',                    '(select auth.uid())',                    'g');
  result := regexp_replace(result, 'auth\.role\(\)',                   '(select auth.role())',                   'g');
  result := regexp_replace(result, 'auth\.jwt\(\)',                    '(select auth.jwt())',                    'g');
  result := regexp_replace(result, 'auth\.email\(\)',                  '(select auth.email())',                  'g');
  result := regexp_replace(result, 'current_request_site_id\(\)',      '(select current_request_site_id())',      'g');
  result := regexp_replace(result, 'current_request_site_ids\(\)',     '(select current_request_site_ids())',     'g');

  -- 2. Collapse double-wraps that resulted from step 1 (i.e. inputs
  --    that were already correctly wrapped before this migration).
  result := regexp_replace(result, '\(select \(select (auth\.[a-z_]+\(\))\)\)',                      '(select \1)', 'g');
  result := regexp_replace(result, '\(select \(select (current_request_site_ids?\(\))\)\)',          '(select \1)', 'g');

  RETURN result;
END;
$$;

DO $$
DECLARE
  pol RECORD;
  new_qual text;
  new_check text;
  roles_clause text;
  policy_sql text;
  cmd_clause text;
BEGIN
  FOR pol IN
    SELECT schemaname,
           tablename,
           policyname,
           cmd,
           roles,
           permissive,
           qual,
           with_check
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  (
              (qual       IS NOT NULL AND (qual       ~ 'auth\.[a-z_]+\(\)' OR qual       ~ 'current_request_site_ids?\(\)'))
           OR (with_check IS NOT NULL AND (with_check ~ 'auth\.[a-z_]+\(\)' OR with_check ~ 'current_request_site_ids?\(\)'))
           )
  LOOP
    new_qual  := pg_temp.__wrap_initplan(pol.qual);
    new_check := pg_temp.__wrap_initplan(pol.with_check);

    -- Skip if there's nothing to change (already wrapped).
    IF (new_qual  IS NOT DISTINCT FROM pol.qual)
   AND (new_check IS NOT DISTINCT FROM pol.with_check) THEN
      CONTINUE;
    END IF;

    -- Build a comma-separated role list. pg_policies.roles is name[].
    -- The default `{public}` means "no TO clause"; emit it explicitly
    -- to keep the rewritten policy semantically identical.
    roles_clause := array_to_string(
      ARRAY(SELECT quote_ident(r) FROM unnest(pol.roles) AS r),
      ', '
    );

    cmd_clause := pol.cmd;  -- 'ALL' / 'SELECT' / 'INSERT' / 'UPDATE' / 'DELETE'

    EXECUTE format('DROP POLICY %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);

    policy_sql := format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s',
      pol.policyname,
      pol.schemaname,
      pol.tablename,
      pol.permissive,            -- 'PERMISSIVE' or 'RESTRICTIVE'
      cmd_clause,
      roles_clause
    );

    -- INSERT-only policies cannot have a USING clause; SELECT/DELETE
    -- cannot have WITH CHECK. pg_policies surfaces the appropriate
    -- side as NULL, so we mirror that here.
    IF new_qual IS NOT NULL THEN
      policy_sql := policy_sql || format(' USING (%s)', new_qual);
    END IF;
    IF new_check IS NOT NULL THEN
      policy_sql := policy_sql || format(' WITH CHECK (%s)', new_check);
    END IF;

    EXECUTE policy_sql;
  END LOOP;
END;
$$;

-- Drop the temp helper. pg_temp objects normally vanish at session
-- end, but explicit DROP keeps the migration's side effects local.
DROP FUNCTION IF EXISTS pg_temp.__wrap_initplan(text);
