-- ═══════════════════════════════════════════════════════════════════
-- Migration 00082 (audit S-08): lock down SECURITY DEFINER and
--                              advisor-flagged functions in `public`
-- ═══════════════════════════════════════════════════════════════════
--
-- Background
-- ----------
-- The Supabase security advisor flagged two related issues:
--
--   1. `function_search_path_mutable` (lint 0011) on 14 functions in
--      `public`. A mutable search_path is a privilege-escalation
--      primitive: an attacker who controls a non-public schema (e.g.
--      via a temp table or an extension hijack — see S-12) can shadow
--      a function name the SECURITY DEFINER routine relies on.
--
--   2. `anon_security_definer_function_executable` /
--      `authenticated_security_definer_function_executable` (lints
--      0007/0008) on `purge_retention`, `reorder_pages`,
--      `set_linked_products`, `rls_auto_enable`. These functions
--      should be reachable only via `service_role` (cron, webhook
--      handlers); EXECUTE on `anon`/`authenticated` is a foot-gun.
--
-- Strategy
-- --------
-- Rather than maintain an allow-list per environment (and have it
-- silently drift as new functions are added), this migration walks
-- `pg_proc` for the `public` schema and:
--
--   * For every function whose `proconfig` does not pin
--     `search_path`, ALTER it to `SET search_path = pg_catalog, public`.
--     `pg_catalog` first guards built-in operator/cast lookups; `public`
--     keeps the function's existing object references valid.
--
--   * For every SECURITY DEFINER function in `public`, REVOKE EXECUTE
--     from `PUBLIC`, `anon`, `authenticated` and GRANT to
--     `service_role`. This is the same "service_role-only" pattern
--     the table-level RLS uses for sensitive operations.
--
-- We deliberately exclude:
--   * `auth.*`, `realtime.*`, `storage.*`, `extensions.*`,
--     `vault.*`, `pg_*`, `information_schema.*` — Supabase-managed
--     and altering them risks breaking the platform.
--   * Trigger functions used by `BEFORE`/`AFTER` triggers — they are
--     never called via REST/RPC, so EXECUTE GRANTs are irrelevant;
--     we still pin their search_path.
--
-- Cross-references: G-CI-02 adds a CI lint to fail any new
-- `CREATE FUNCTION ... SECURITY DEFINER` in
-- `supabase/migrations/*.sql` that does not also declare
-- `SET search_path = …`.
--
-- Rollback: see 00082-down.sql, which removes the `search_path` pin
-- and restores PUBLIC EXECUTE. Re-introduces the advisor warnings
-- and the privesc primitive — only run as a last resort.

-- ── 1. Pin search_path on every public function that doesn't have one ──
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args,
           p.proconfig
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  (
              p.proconfig IS NULL
           OR NOT EXISTS (
                SELECT 1
                FROM   unnest(p.proconfig) AS c
                WHERE  c LIKE 'search_path=%'
              )
           )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = pg_catalog, public',
      f.proname, f.args
    );
  END LOOP;
END;
$$;

-- ── 2. Lock SECURITY DEFINER funcs to service_role only ────────────────
DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM   pg_proc p
    JOIN   pg_namespace n ON n.oid = p.pronamespace
    WHERE  n.nspname = 'public'
      AND  p.prosecdef = true
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
      f.proname, f.args
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
      f.proname, f.args
    );
  END LOOP;
END;
$$;
