-- ═══════════════════════════════════════════════════════
-- Migration 00038: Reintroduce Public RLS (Fix F-002)
-- ═══════════════════════════════════════════════════════
-- Re-grants SELECT access to the `anon` role and creates strict 
-- policies that ensure cross-tenant data isolation and require 
-- the parent site to be active.

GRANT SELECT ON sites TO anon;
GRANT SELECT ON categories TO anon;
GRANT SELECT ON products TO anon;
GRANT SELECT ON content TO anon;
GRANT SELECT ON pages TO anon;
GRANT SELECT ON content_products TO anon;
GRANT SELECT ON ad_placements TO anon;

-- sites
DROP POLICY IF EXISTS "public_read_sites" ON sites;
CREATE POLICY "public_read_sites" ON sites
  FOR SELECT TO anon USING (is_active = true);

-- categories
DROP POLICY IF EXISTS "public_read_categories" ON categories;
CREATE POLICY "public_read_categories" ON categories
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = categories.site_id
        AND sites.is_active = true
    )
  );

-- products
DROP POLICY IF EXISTS "public_read_active_products" ON products;
CREATE POLICY "public_read_active_products" ON products
  FOR SELECT TO anon USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = products.site_id
        AND sites.is_active = true
    )
  );

-- content
DROP POLICY IF EXISTS "public_read_published_content" ON content;
CREATE POLICY "public_read_published_content" ON content
  FOR SELECT TO anon USING (
    status = 'published'
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = content.site_id
        AND sites.is_active = true
    )
  );

-- pages
DROP POLICY IF EXISTS "public_read_published_pages" ON pages;
CREATE POLICY "public_read_published_pages" ON pages
  FOR SELECT TO anon USING (
    is_published = true
    AND EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = pages.site_id
        AND sites.is_active = true
    )
  );

-- content_products
DROP POLICY IF EXISTS "public_read_content_products" ON content_products;
CREATE POLICY "public_read_content_products" ON content_products
  FOR SELECT TO anon USING (
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

-- ad_placements
DROP POLICY IF EXISTS "ad_placements_public_read" ON ad_placements;
CREATE POLICY "ad_placements_public_read" ON ad_placements
  FOR SELECT TO anon USING (
    EXISTS (
      SELECT 1 FROM sites
      WHERE sites.id = ad_placements.site_id
        AND sites.is_active = true
    )
  );
