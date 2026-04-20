-- ═══════════════════════════════════════════════════════
-- Migration 00035: Tenant-bound public RLS policies
-- ═══════════════════════════════════════════════════════
--
-- Problem: the existing public read policies (migrations 00024, 00031)
-- check status flags (is_active, published, etc.) and verify the parent
-- site is active, but they do NOT bind rows to the requesting tenant.
-- An anonymous Supabase REST call can therefore read data from ANY
-- active tenant — a cross-tenant information leak.
--
-- Fix: require the request to carry the tenant identifier via the
-- HTTP header `x-tenant-id`.  PostgREST exposes every request header
-- as a transaction-scoped GUC named `request.header.<name>`, so RLS
-- policies can read it with `current_setting(...)`.
--
-- The application layer sets this header on every anon-key Supabase
-- client via `getTenantAnonClient(siteId)` (see lib/supabase-server.ts).
--
-- If the header is missing or empty, `tenant_site_id()` returns NULL,
-- every `= tenant_site_id()` comparison evaluates to FALSE, and zero
-- rows are returned — fail-closed by design.
--
-- A companion RPC function `set_tenant_context(site_id)` is provided
-- for direct-connection scenarios (tests, psql) where HTTP headers are
-- not available.
--
-- Service-role policies (FOR ALL, auth.role() = 'service_role') are
-- unchanged and bypass these tenant checks as before.
--
-- Safe to re-run: DROP POLICY IF EXISTS + CREATE POLICY is idempotent.
-- ═══════════════════════════════════════════════════════

-- Helper: returns the tenant UUID from the request context.
-- Checks the PostgREST request header first, then falls back to the
-- session GUC (used by tests that connect directly via libpq).
-- Returns NULL when neither is set, making all `= tenant_site_id()`
-- comparisons FALSE (fail-closed).
CREATE OR REPLACE FUNCTION public.tenant_site_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN coalesce(
      nullif(current_setting('request.header.x-tenant-id', true), ''),
      nullif(current_setting('app.current_site_id', true), '')
    ) IS NULL THEN NULL
    ELSE coalesce(
      nullif(current_setting('request.header.x-tenant-id', true), ''),
      nullif(current_setting('app.current_site_id', true), '')
    )::uuid
  END;
$$;

-- RPC callable by the anon role so that test harnesses (and any direct
-- libpq connection) can set the tenant context without HTTP headers.
-- The `true` third argument to set_config makes it LOCAL (transaction-scoped).
CREATE OR REPLACE FUNCTION public.set_tenant_context(site_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM set_config('app.current_site_id', site_id, true);
END;
$$;

-- Allow the anon and authenticated roles to call the RPC.
GRANT EXECUTE ON FUNCTION public.set_tenant_context(text) TO anon, authenticated;

-- ── sites ───────────────────────────────────────────────────────────
-- Before: is_active = true  (any anon reader sees ALL active sites)
-- After:  is_active = true AND id matches the tenant context
DROP POLICY IF EXISTS "public_read_sites" ON sites;
CREATE POLICY "public_read_sites" ON sites
  FOR SELECT USING (
    is_active = true
    AND id = tenant_site_id()
  );

-- ── products ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_active_products" ON products;
CREATE POLICY "public_read_active_products" ON products
  FOR SELECT USING (
    status = 'active'
    AND site_id = tenant_site_id()
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = products.site_id
        AND sites.is_active = true
    )
  );

-- ── content ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_published_content" ON content;
CREATE POLICY "public_read_published_content" ON content
  FOR SELECT USING (
    status = 'published'
    AND site_id = tenant_site_id()
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = content.site_id
        AND sites.is_active = true
    )
  );

-- ── pages ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_published_pages" ON pages;
CREATE POLICY "public_read_published_pages" ON pages
  FOR SELECT USING (
    is_published = true
    AND site_id = tenant_site_id()
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = pages.site_id
        AND sites.is_active = true
    )
  );

-- ── categories ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "public_read_categories" ON categories;
CREATE POLICY "public_read_categories" ON categories
  FOR SELECT USING (
    site_id = tenant_site_id()
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = categories.site_id
        AND sites.is_active = true
    )
  );

-- ── content_products (join table) ───────────────────────────────────
-- content_products has no site_id column; bind via content.site_id.
DROP POLICY IF EXISTS "public_read_content_products" ON content_products;
CREATE POLICY "public_read_content_products" ON content_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM content c
      WHERE c.id = content_products.content_id
        AND c.status = 'published'
        AND c.site_id = tenant_site_id()
    )
    AND EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = content_products.product_id
        AND p.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM sites s
      JOIN content c ON c.site_id = s.id
      WHERE c.id = content_products.content_id
        AND s.is_active = true
    )
  );
