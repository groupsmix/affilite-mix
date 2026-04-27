-- 00038_reintroduce_public_rls-down
--
-- Reverts the SELECT grants to `anon` and the public_read_* policies
-- introduced in 00038_reintroduce_public_rls.sql. Earlier migrations
-- (00035_drop_public_select_policies, 00039_drop_legacy_public_select_policies)
-- already establish the locked-down baseline this rollback returns to.

DROP POLICY IF EXISTS "public_read_sites" ON sites;
DROP POLICY IF EXISTS "public_read_categories" ON categories;
DROP POLICY IF EXISTS "public_read_active_products" ON products;
DROP POLICY IF EXISTS "public_read_published_content" ON content;
DROP POLICY IF EXISTS "public_read_published_pages" ON pages;
DROP POLICY IF EXISTS "public_read_content_products" ON content_products;
DROP POLICY IF EXISTS "ad_placements_public_read" ON ad_placements;

REVOKE SELECT ON ad_placements FROM anon;
REVOKE SELECT ON content_products FROM anon;
REVOKE SELECT ON pages FROM anon;
REVOKE SELECT ON content FROM anon;
REVOKE SELECT ON products FROM anon;
REVOKE SELECT ON categories FROM anon;
REVOKE SELECT ON sites FROM anon;
