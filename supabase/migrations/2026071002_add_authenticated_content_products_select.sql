-- Public and admin pages use a site-scoped authenticated client for linked
-- product reads. content_products has no site_id, so enforce tenant isolation
-- through both parent rows.

GRANT SELECT ON public.content_products TO authenticated;

DROP POLICY IF EXISTS tenant_isolation_auth_content_products ON public.content_products;
CREATE POLICY tenant_isolation_auth_content_products
  ON public.content_products
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.content c
      JOIN public.products p ON p.id = content_products.product_id
      WHERE c.id = content_products.content_id
        AND c.site_id = p.site_id
        AND c.site_id = ANY(public.current_request_site_ids())
    )
  );
