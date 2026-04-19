-- ═══════════════════════════════════════════════════════
-- Migration 00031: Harden public RLS — require active parent site
-- ═══════════════════════════════════════════════════════
--
-- Problem: the public read policies for products, content, pages, and
-- content_products only check the row's own published/active flag.
-- They do not verify that the parent site is still active (is_active = true).
-- A deactivated tenant's content remains publicly readable via direct
-- Supabase API calls if the row identifiers are known.
--
-- Fix: align all public read policies with the stricter categories pattern
-- (migration 00024) which already gates on sites.is_active = true.
--
-- Safe to re-run: DROP POLICY IF EXISTS + CREATE POLICY is idempotent.
-- ═══════════════════════════════════════════════════════

-- ── products ─────────────────────────────────────────────────────────
-- Before: status = 'active'
-- After:  status = 'active' AND parent site is active
DROP POLICY IF EXISTS "public_read_active_products" ON products;
CREATE POLICY "public_read_active_products" ON products
  FOR SELECT USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = products.site_id
        AND sites.is_active = true
    )
  );

-- ── content ──────────────────────────────────────────────────────────
-- Before: status = 'published'
-- After:  status = 'published' AND parent site is active
DROP POLICY IF EXISTS "public_read_published_content" ON content;
CREATE POLICY "public_read_published_content" ON content
  FOR SELECT USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = content.site_id
        AND sites.is_active = true
    )
  );

-- ── pages ────────────────────────────────────────────────────────────
-- Before: is_published = true
-- After:  is_published = true AND parent site is active
DROP POLICY IF EXISTS "public_read_published_pages" ON pages;
CREATE POLICY "public_read_published_pages" ON pages
  FOR SELECT USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = pages.site_id
        AND sites.is_active = true
    )
  );

-- ── content_products (join table) ────────────────────────────────────
-- Before (migration 00024): only checks that the linked content is published.
-- After: also requires the linked product to be active AND the parent site
--        to be active. This prevents join-table enumeration for deactivated
--        tenants even when individual row IDs are known.
DROP POLICY IF EXISTS "public_read_content_products" ON content_products;
CREATE POLICY "public_read_content_products" ON content_products
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM content c
      WHERE c.id = content_products.content_id
        AND c.status = 'published'
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
