-- 2026062601_rewrap_initplan_00092-down
--
-- Rollback for 2026062601_rewrap_initplan_00092.sql.
--
-- Restores the bare (unwrapped) 00092 policies. WARNING: this
-- re-introduces the initplan perf regression. Only run if the
-- wrapped form causes a planner issue.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_products' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_products ON public.products;
    CREATE POLICY tenant_isolation_auth_products ON public.products
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_content' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_content ON public.content;
    CREATE POLICY tenant_isolation_auth_content ON public.content
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_pages' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_pages ON public.pages;
    CREATE POLICY tenant_isolation_auth_pages ON public.pages
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_categories' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_categories ON public.categories;
    CREATE POLICY tenant_isolation_auth_categories ON public.categories
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_newsletter_subscribers' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_newsletter_subscribers ON public.newsletter_subscribers;
    CREATE POLICY tenant_isolation_auth_newsletter_subscribers ON public.newsletter_subscribers
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'tenant_isolation_auth_affiliate_clicks' AND schemaname = 'public') THEN
    DROP POLICY IF EXISTS tenant_isolation_auth_affiliate_clicks ON public.affiliate_clicks;
    CREATE POLICY tenant_isolation_auth_affiliate_clicks ON public.affiliate_clicks
      FOR ALL TO authenticated
      USING (site_id = ANY(current_request_site_ids()));
  END IF;
END;
$$;
