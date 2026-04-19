-- 00028: Harden public RLS policies with tenant isolation
--
-- Previously, public_read_active_products and public_read_published_content
-- only checked the row's status column, allowing anon-key queries to read
-- data from deactivated sites.  This migration adds a sites.is_active guard
-- to every public SELECT policy, matching the pattern already used by
-- public_read_categories.
--
-- Also hardens content_products and pages policies the same way.

BEGIN;

-- ── Products: require parent site to be active ──────────────────────────
DROP POLICY IF EXISTS "public_read_active_products" ON products;
CREATE POLICY "public_read_active_products"
  ON products FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM sites WHERE sites.id = products.site_id AND sites.is_active = true
    )
  );

-- ── Content: require parent site to be active ───────────────────────────
DROP POLICY IF EXISTS "public_read_published_content" ON content;
CREATE POLICY "public_read_published_content"
  ON content FOR SELECT
  USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM sites WHERE sites.id = content.site_id AND sites.is_active = true
    )
  );

-- ── Content-Products join: check site via content row ───────────────────
DROP POLICY IF EXISTS "public_read_content_products" ON content_products;
CREATE POLICY "public_read_content_products"
  ON content_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM content c
      JOIN sites s ON s.id = c.site_id
      WHERE c.id = content_products.content_id
        AND c.status = 'published'
        AND s.is_active = true
    )
  );

-- ── Pages: require parent site to be active ─────────────────────────────
DROP POLICY IF EXISTS "public_read_published_pages" ON pages;
CREATE POLICY "public_read_published_pages"
  ON pages FOR SELECT
  USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM sites WHERE sites.id = pages.site_id AND sites.is_active = true
    )
  );

COMMIT;
