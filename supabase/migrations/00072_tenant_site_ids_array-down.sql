-- 00072_tenant_site_ids_array-down
--
-- Restore the 00067 tenant-scope helper / policy shape: a single
-- `current_request_site_id() RETURNS uuid` plus equality predicates.
--
-- Run this only if a regression in the array-based policies forces a
-- rollback; re-apply 00072 immediately afterwards. Note that any JWT
-- minted with `app_metadata.site_ids` will resolve to the *first*
-- element under the legacy helper, which is sufficient for the
-- single-site flows that 00067 was built for.

-- 1. Drop the array-shaped policies on every site-scoped table and
--    reinstate the 00067 single-uuid equality form.
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

-- 2. Restore the 00067 single-uuid implementation of
--    current_request_site_id() (no longer a shim over the array helper).
CREATE OR REPLACE FUNCTION public.current_request_site_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.jwt.claims', true)::json
        #>> '{app_metadata,site_id}',
      current_setting('request.jwt.claims', true)::json ->> 'site_id'
    ),
    ''
  )::uuid;
$$;

COMMENT ON FUNCTION public.current_request_site_id() IS
  'Returns the tenant uuid from app_metadata.site_id (preferred) or the legacy top-level claim. Used by tenant_isolation_* RLS policies. Safe to call from RLS predicates because it is STABLE and uses NULLIF + cast to guard against missing/blank claims.';

-- 3. Drop the array helper last, after every dependent policy has been
--    rewritten back to the legacy helper.
DROP FUNCTION IF EXISTS public.current_request_site_ids();
