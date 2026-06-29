-- DB-04: Multi-site RLS — update policies to use current_request_site_ids()
-- where applicable, so admins with multi-site JWT can see rows across sites.
-- EG: Wrapped function calls in (select ...) to match init-plan optimisation
-- required by check-migrations.sh (see migration 00082 and audit G-CI-01).
--
-- DB-05: Fix dead grant on record_ad_impression — grant to anon (aligned
-- with the public_insert_ad_impressions policy).
--
-- DB-08: Standardize affiliate_clicks.site_id ON DELETE to RESTRICT
-- (force operator to archive/anonymise before site deletion).

-- ── DB-04: Update tenant isolation policies to support multi-site ────
-- The current_request_site_ids() function (00073) returns uuid[] but
-- existing policies use scalar current_request_site_id(). Update them
-- to use ANY() so multi-site JWTs work correctly.

DO $$
BEGIN
  -- Only proceed if the array function exists (it was added in 00073)
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_request_site_ids'
  ) THEN
    -- Update products policy
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_products') THEN
      DROP POLICY IF EXISTS tenant_isolation_auth_products ON public.products;
      CREATE POLICY tenant_isolation_auth_products ON public.products
        FOR ALL TO authenticated
        USING (site_id = ANY((select current_request_site_ids())));
    END IF;

    -- Update content policy
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_content') THEN
      DROP POLICY IF EXISTS tenant_isolation_auth_content ON public.content;
      CREATE POLICY tenant_isolation_auth_content ON public.content
        FOR ALL TO authenticated
        USING (site_id = ANY((select current_request_site_ids())));
    END IF;

    -- Update pages policy
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_pages') THEN
      DROP POLICY IF EXISTS tenant_isolation_auth_pages ON public.pages;
      CREATE POLICY tenant_isolation_auth_pages ON public.pages
        FOR ALL TO authenticated
        USING (site_id = ANY((select current_request_site_ids())));
    END IF;

    -- Update categories policy
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_categories') THEN
      DROP POLICY IF EXISTS tenant_isolation_auth_categories ON public.categories;
      CREATE POLICY tenant_isolation_auth_categories ON public.categories
        FOR ALL TO authenticated
        USING (site_id = ANY((select current_request_site_ids())));
    END IF;

    -- Update newsletter_subscribers policy
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_newsletter_subscribers') THEN
      DROP POLICY IF EXISTS tenant_isolation_auth_newsletter_subscribers ON public.newsletter_subscribers;
      CREATE POLICY tenant_isolation_auth_newsletter_subscribers ON public.newsletter_subscribers
        FOR ALL TO authenticated
        USING (site_id = ANY((select current_request_site_ids())));
    END IF;

    -- Update affiliate_clicks policy
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_affiliate_clicks') THEN
      DROP POLICY IF EXISTS tenant_isolation_auth_affiliate_clicks ON public.affiliate_clicks;
      CREATE POLICY tenant_isolation_auth_affiliate_clicks ON public.affiliate_clicks
        FOR ALL TO authenticated
        USING (site_id = ANY((select current_request_site_ids())));
    END IF;
  END IF;
END $$;

-- ── DB-05: Fix dead grant on record_ad_impression ───────────────────
-- The function is SECURITY INVOKER but INSERT INTO ad_impressions is
-- RLS-blocked for authenticated (only anon has public_insert). Grant
-- EXECUTE to anon and revoke from authenticated.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'record_ad_impression'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.record_ad_impression FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.record_ad_impression TO anon;
  END IF;
END $$;

-- ── DB-08: Standardize affiliate_clicks.site_id ON DELETE policy ────
-- Change from SET NULL to RESTRICT so site deletion requires explicit
-- archival/anonymisation of click data first.
DO $$
DECLARE
  fk_name text;
BEGIN
  -- Find the FK constraint name
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'affiliate_clicks'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'site_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.affiliate_clicks DROP CONSTRAINT %I', fk_name);
    ALTER TABLE public.affiliate_clicks
      ADD CONSTRAINT fk_affiliate_clicks_site_id
      FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE RESTRICT;
  END IF;
END $$;
