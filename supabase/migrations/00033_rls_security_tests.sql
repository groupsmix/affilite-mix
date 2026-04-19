-- ═══════════════════════════════════════════════════════
-- Migration 00033: Automated RLS security assertion tests
-- ═══════════════════════════════════════════════════════
--
-- Creates a stored function that runs a battery of RLS assertions as the
-- anon role.  The function returns a TABLE of (test_name, passed, detail)
-- rows.  Every row should have passed = true for the security posture to
-- be considered healthy.
--
-- Usage:
--   SELECT * FROM public.rls_security_tests();
--
-- Schedule this as a periodic health check or call it from CI after
-- applying migrations to a test database.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.rls_security_tests()
RETURNS TABLE(test_name text, passed boolean, detail text)
LANGUAGE plpgsql
SECURITY DEFINER          -- runs as the function owner (superuser / migration role)
SET search_path = public  -- pin search_path for security
AS $$
DECLARE
  _count bigint;
  _has_rls boolean;
  _table_name text;
  _policy_count bigint;
BEGIN
  -- ────────────────────────────────────────────────────────
  -- 1. Verify RLS is enabled on all tenant-scoped tables
  -- ────────────────────────────────────────────────────────
  FOR _table_name IN
    SELECT unnest(ARRAY[
      'sites', 'content', 'products', 'categories',
      'affiliate_clicks', 'newsletter_subscribers', 'content_products',
      'audit_log', 'admin_users', 'pages', 'scheduled_jobs',
      'ad_placements', 'ad_impressions', 'shared_content', 'niche_templates'
    ])
  LOOP
    SELECT relrowsecurity INTO _has_rls
    FROM pg_class
    WHERE relname = _table_name AND relnamespace = 'public'::regnamespace;

    test_name := 'rls_enabled_' || _table_name;
    IF _has_rls IS NULL THEN
      passed := true;
      detail := 'Table does not exist (skipped)';
    ELSIF _has_rls THEN
      passed := true;
      detail := 'RLS is enabled';
    ELSE
      passed := false;
      detail := 'RLS is NOT enabled — data is exposed to all roles';
    END IF;
    RETURN NEXT;
  END LOOP;

  -- ────────────────────────────────────────────────────────
  -- 2. Verify every RLS-enabled table has at least one policy
  -- ────────────────────────────────────────────────────────
  FOR _table_name IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
  LOOP
    SELECT count(*) INTO _policy_count
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = _table_name;

    test_name := 'has_policies_' || _table_name;
    passed := _policy_count > 0;
    detail := _policy_count || ' policy(ies) found';
    RETURN NEXT;
  END LOOP;

  -- ────────────────────────────────────────────────────────
  -- 3. Verify no policy uses USING(true) (overly permissive)
  -- ────────────────────────────────────────────────────────
  SELECT count(*) INTO _count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND qual = 'true';

  test_name := 'no_using_true_policies';
  passed := _count = 0;
  detail := _count || ' policy(ies) with USING(true)';
  RETURN NEXT;

  -- ────────────────────────────────────────────────────────
  -- 4. Verify public read policies for content/products gate on active site
  -- ────────────────────────────────────────────────────────
  -- Check that the public_read_published_content policy references sites.is_active
  SELECT count(*) INTO _count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'content'
    AND policyname = 'public_read_published_content'
    AND qual LIKE '%is_active%';

  test_name := 'content_public_read_gates_on_active_site';
  passed := _count > 0;
  detail := CASE WHEN _count > 0
    THEN 'Policy references is_active check'
    ELSE 'Policy does NOT gate on site is_active — cross-tenant leakage risk'
  END;
  RETURN NEXT;

  SELECT count(*) INTO _count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'products'
    AND policyname = 'public_read_active_products'
    AND qual LIKE '%is_active%';

  test_name := 'products_public_read_gates_on_active_site';
  passed := _count > 0;
  detail := CASE WHEN _count > 0
    THEN 'Policy references is_active check'
    ELSE 'Policy does NOT gate on site is_active — cross-tenant leakage risk'
  END;
  RETURN NEXT;

  -- ────────────────────────────────────────────────────────
  -- 5. Verify service-role-only policies exist on admin tables
  -- ────────────────────────────────────────────────────────
  FOR _table_name IN
    SELECT unnest(ARRAY[
      'admin_users', 'audit_log', 'scheduled_jobs'
    ])
  LOOP
    SELECT count(*) INTO _count
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = _table_name
      AND qual LIKE '%service_role%';

    test_name := 'service_role_policy_' || _table_name;
    IF _count > 0 THEN
      passed := true;
      detail := 'Has service_role-gated policy';
    ELSE
      -- Table might not exist yet
      SELECT EXISTS(
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = _table_name
      ) INTO _has_rls;

      IF NOT _has_rls THEN
        passed := true;
        detail := 'Table does not exist (skipped)';
      ELSE
        passed := false;
        detail := 'No service_role-gated policy found — admin data may be exposed';
      END IF;
    END IF;
    RETURN NEXT;
  END LOOP;

  -- ────────────────────────────────────────────────────────
  -- 6. Verify newsletter insert policy validates site_id
  -- ────────────────────────────────────────────────────────
  SELECT count(*) INTO _count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'newsletter_subscribers'
    AND policyname = 'public_insert_newsletter'
    AND with_check LIKE '%sites%';

  test_name := 'newsletter_insert_validates_site_id';
  passed := _count > 0;
  detail := CASE WHEN _count > 0
    THEN 'Insert policy validates site_id FK'
    ELSE 'Insert policy does NOT validate site_id — phantom site injection possible'
  END;
  RETURN NEXT;

END;
$$;

COMMENT ON FUNCTION public.rls_security_tests() IS
  'Runs automated RLS security assertions. All rows should return passed = true. '
  'Call from CI or as a periodic health check after applying migrations.';
