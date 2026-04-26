-- 00067_harden_tenant_isolation_rls-down
--
-- DANGEROUS: This rollback restores the wide-open authenticated policies
-- introduced by 00064_tenant_isolation_rls.sql. Only run it if
-- application code regression-locks against the new policies AND you
-- accept that authenticated users will regain SELECT/UPDATE/DELETE on
-- admin_users, roles, permissions, audit_log, etc. for the duration of
-- the rollback window. Re-apply 00067 immediately afterwards.

-- 1. Remove the explicit deny policies.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'admin_users','roles','permissions','role_permissions','user_site_roles',
      'admin_site_memberships','audit_log','niche_templates',
      'integration_providers','site_integrations','stripe_events'
    ])
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE  table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
        'authenticated_no_access_' || t, t);
    END IF;
  END LOOP;
END;
$$;

-- 2. Restore the IS NULL-fallback policies on site-scoped tables and
--    the FOR ALL TO authenticated USING (true) policies on global
--    tables, exactly as 00064 created them.
DO $$
DECLARE
  t text;
  has_site_id boolean;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'site_id'
    ) INTO has_site_id;

    IF has_site_id THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I',
        'tenant_isolation_auth_' || t, t);
      EXECUTE format($f$
        CREATE POLICY %I ON %I
        FOR ALL TO authenticated
        USING (
          (current_setting('request.jwt.claims', true)::json->>'site_id') IS NULL
          OR (current_setting('request.jwt.claims', true)::json->>'site_id') = site_id::text
        )
        WITH CHECK (
          (current_setting('request.jwt.claims', true)::json->>'site_id') IS NULL
          OR (current_setting('request.jwt.claims', true)::json->>'site_id') = site_id::text
        )
      $f$, 'tenant_isolation_auth_' || t, t);
    ELSE
      EXECUTE format($f$
        CREATE POLICY %I ON %I
        FOR ALL TO authenticated
        USING (true)
        WITH CHECK (true)
      $f$, 'tenant_isolation_auth_global_' || t, t);
    END IF;
  END LOOP;
END;
$$;

-- 3. Restore the looser ad_impressions insert policy (no site active check).
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
        EXISTS (SELECT 1 FROM public.sites s WHERE s.id = ad_impressions.site_id)
      );
  END IF;
END;
$$;

-- 4. Drop the helper function only after the policies that used it are
--    gone.
DROP FUNCTION IF EXISTS public.current_request_site_id();
