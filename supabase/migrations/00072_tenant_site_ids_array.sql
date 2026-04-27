-- 00072_tenant_site_ids_array
--
-- A-09 (audit): evolve the tenant-scope helper from a single uuid to a
-- uuid[] so a single admin user can be authorised against more than one
-- site without minting a fresh JWT per request.
--
-- The previous helper, introduced in 00067_harden_tenant_isolation_rls,
-- was:
--
--   public.current_request_site_id() RETURNS uuid
--
-- and every `tenant_isolation_auth_<table>` policy compared it for
-- equality:
--
--   USING (current_request_site_id() IS NOT NULL
--          AND current_request_site_id() = site_id)
--
-- Hardcoding equality at the DB layer hardcodes "one site per user". The
-- existing `user_site_roles` table already models multi-site
-- assignments, so the JWT can carry every site_id the user is entitled
-- to and RLS just needs to switch from `=` to `= ANY(...)`.
--
-- Backwards compatibility:
--
--   - The new helper `current_request_site_ids()` reads the preferred
--     server-controlled claim `app_metadata.site_ids` (a json array),
--     falling back to the legacy `app_metadata.site_id` (single uuid)
--     and finally the legacy top-level `site_id` claim. JWTs minted
--     before this migration is deployed therefore continue to satisfy
--     RLS — the legacy single-claim path resolves to a one-element
--     array.
--
--   - The legacy helper `current_request_site_id()` is reissued as a
--     thin shim that returns `current_request_site_ids()[1]` so any
--     external SQL (or migration regression locks pinned to it) keeps
--     working until callers are migrated.
--
-- Rollback: see 00072_tenant_site_ids_array-down.sql, which restores
-- the 00067 single-uuid helper and predicates verbatim.

-- ─────────────────────────────────────────────────────────────────────
-- 1. New helper: pull site_ids from app_metadata.site_ids (preferred).
--
-- We accept three claim shapes for forwards / backwards compatibility:
--   a. app_metadata.site_ids  → ['<uuid>', '<uuid>', ...]   (preferred)
--   b. app_metadata.site_id   → '<uuid>'                    (legacy single)
--   c. top-level site_id      → '<uuid>'                    (legacy single)
--
-- Empty array on no claim. Cardinality check in policy predicates
-- guards against the implicit "see everything" trap.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_request_site_ids()
RETURNS uuid[]
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  claims      json;
  arr_text    text;
  arr_json    json;
  result      uuid[];
  legacy_app  text;
  legacy_top  text;
BEGIN
  -- A missing or malformed claims setting yields NULL here; fall through
  -- to the empty array so RLS denies by default.
  BEGIN
    claims := current_setting('request.jwt.claims', true)::json;
  EXCEPTION WHEN others THEN
    RETURN ARRAY[]::uuid[];
  END;

  IF claims IS NULL THEN
    RETURN ARRAY[]::uuid[];
  END IF;

  -- (a) preferred: app_metadata.site_ids is a json array of uuid strings.
  arr_json := claims #> '{app_metadata,site_ids}';
  IF arr_json IS NOT NULL AND json_typeof(arr_json) = 'array' THEN
    SELECT COALESCE(array_agg(NULLIF(elem, '')::uuid), ARRAY[]::uuid[])
      INTO result
      FROM json_array_elements_text(arr_json) AS elem
      WHERE NULLIF(elem, '') IS NOT NULL;
    IF result IS NOT NULL AND cardinality(result) > 0 THEN
      RETURN result;
    END IF;
  END IF;

  -- (b) legacy single: app_metadata.site_id (string).
  legacy_app := NULLIF(claims #>> '{app_metadata,site_id}', '');
  IF legacy_app IS NOT NULL THEN
    RETURN ARRAY[legacy_app::uuid];
  END IF;

  -- (c) legacy top-level claim (only honoured for service-side flows
  --     that mint their own JWT and never use app_metadata).
  legacy_top := NULLIF(claims ->> 'site_id', '');
  IF legacy_top IS NOT NULL THEN
    RETURN ARRAY[legacy_top::uuid];
  END IF;

  RETURN ARRAY[]::uuid[];
END;
$$;

COMMENT ON FUNCTION public.current_request_site_ids() IS
  'A-09: returns the tenant uuid[] from app_metadata.site_ids (preferred), or wraps the legacy app_metadata.site_id / top-level site_id single-claim into a one-element array. Used by tenant_isolation_auth_* RLS policies via site_id = ANY(...).';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Reissue the legacy helper as a thin shim so any external SQL
--    (and the 00067 regression-lock tests) keep working. We deliberately
--    keep the same signature; new code should call the array variant.
-- ─────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.current_request_site_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT (public.current_request_site_ids())[1];
$$;

COMMENT ON FUNCTION public.current_request_site_id() IS
  'Deprecated: prefer public.current_request_site_ids(). Retained as a thin shim returning the first element so legacy SQL keeps working through the 00072 deploy window.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. Re-issue tenant_isolation_auth_<t> on every site-scoped table
--    using `site_id = ANY(current_request_site_ids())`. The cardinality
--    guard preserves 00067's "no claim → no rows" hardening — an empty
--    array MUST NOT match anything.
-- ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  t           text;
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
          cardinality(public.current_request_site_ids()) > 0
          AND site_id = ANY (public.current_request_site_ids())
        )
        WITH CHECK (
          cardinality(public.current_request_site_ids()) > 0
          AND site_id = ANY (public.current_request_site_ids())
        )
      $f$, 'tenant_isolation_auth_' || t, t);
    END IF;
  END LOOP;
END;
$$;
