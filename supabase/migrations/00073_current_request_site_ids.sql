-- ============================================================
-- Migration 00073: A-009 — current_request_site_ids()
-- Evolves the single-site helper into an array variant so that
-- a JWT may carry `app_metadata.site_ids` (uuid[]) for admins
-- who legitimately span multiple sites, while RLS still evaluates
-- membership via the ANY(array) operator.
-- ============================================================

-- Array variant: returns all site_ids the current JWT claims.
CREATE OR REPLACE FUNCTION public.current_request_site_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    -- Preferred: app_metadata.site_ids (array of uuids).
    (
      SELECT ARRAY_AGG(x::uuid)
      FROM jsonb_array_elements_text(
        current_setting('request.jwt.claims', true)::jsonb
          #> '{app_metadata,site_ids}'
      ) AS x
      WHERE x IS NOT NULL AND x <> ''
    ),
    -- Fallback 1: single site_id inside app_metadata.
    (
      SELECT ARRAY[NULLIF(
        current_setting('request.jwt.claims', true)::json
          #>> '{app_metadata,site_id}',
        ''
      )::uuid]
      WHERE NULLIF(
        current_setting('request.jwt.claims', true)::json
          #>> '{app_metadata,site_id}',
        ''
      ) IS NOT NULL
    ),
    -- Fallback 2: legacy top-level site_id.
    (
      SELECT ARRAY[NULLIF(
        current_setting('request.jwt.claims', true)::json ->> 'site_id',
        ''
      )::uuid]
      WHERE NULLIF(
        current_setting('request.jwt.claims', true)::json ->> 'site_id',
        ''
      ) IS NOT NULL
    )
  );
$$;

COMMENT ON FUNCTION public.current_request_site_ids() IS
  'Returns an array of tenant uuids from app_metadata.site_ids (preferred), app_metadata.site_id, or the legacy top-level claim. Used by tenant_isolation_* RLS policies when multi-site admin access is required. Safe to call from RLS predicates because it is STABLE.';

-- Convenience scalar wrapper so existing policies don't have to be rewritten.
-- This simply returns the first (and usually only) element of the array.
CREATE OR REPLACE FUNCTION public.current_request_site_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT (
    public.current_request_site_ids()
  )[1];
$$;

COMMENT ON FUNCTION public.current_request_site_id() IS
  'Scalar wrapper returning the first site_id from current_request_site_ids(). Backward-compatible with all existing tenant_isolation_* RLS policies.';
