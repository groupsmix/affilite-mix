-- ═══════════════════════════════════════════════════════
-- Audit Fixes: Harden public RLS policies & add missing indexes
-- ═══════════════════════════════════════════════════════
--
-- 2.2 (HIGH): Tighten remaining overly permissive public RLS policies:
--   - public_read_sites: restrict to active sites only
--   - public_read_categories: scope to active sites
--   - public_read_content_products: scope to published content only
--   - public_insert_clicks: validate site_id exists
--   - public_insert_newsletter: validate site_id exists
--
-- 2.3 (MEDIUM): Add composite indexes for uncovered DAL query patterns.
-- ═══════════════════════════════════════════════════════

-- ─── 2.2  Harden public RLS policies ─────────────────────

-- Sites: only expose active sites to anon readers
DROP POLICY IF EXISTS "public_read_sites" ON sites;
DROP POLICY IF EXISTS "Public can read sites" ON sites;
CREATE POLICY "public_read_sites" ON sites
  FOR SELECT USING (is_active = true);

-- Categories: only expose categories belonging to active sites
DROP POLICY IF EXISTS "public_read_categories" ON categories;
DROP POLICY IF EXISTS "Public can read categories" ON categories;
CREATE POLICY "public_read_categories" ON categories
  FOR SELECT
  USING (EXISTS (SELECT 1 FROM sites WHERE sites.id = categories.site_id AND sites.is_active = true));

-- Content-products join: only expose rows for published content
DROP POLICY IF EXISTS "public_read_content_products" ON content_products;
DROP POLICY IF EXISTS "Public can read content_products" ON content_products;
CREATE POLICY "public_read_content_products" ON content_products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM content c
      WHERE c.id = content_products.content_id AND c.status = 'published'
    )
  );

-- Clicks: validate that site_id references a real site
DROP POLICY IF EXISTS "public_insert_clicks" ON affiliate_clicks;
DROP POLICY IF EXISTS "Public can insert clicks" ON affiliate_clicks;
CREATE POLICY "public_insert_clicks" ON affiliate_clicks
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM sites WHERE sites.id = affiliate_clicks.site_id));

-- Newsletter: validate that site_id references a real site
DROP POLICY IF EXISTS "public_insert_newsletter" ON newsletter_subscribers;
DROP POLICY IF EXISTS "Public can insert newsletter" ON newsletter_subscribers;
CREATE POLICY "public_insert_newsletter" ON newsletter_subscribers
  FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM sites WHERE sites.id = newsletter_subscribers.site_id));

-- ─── 2.3  Add missing composite indexes ─────────────────

-- Affiliate clicks: listing by site ordered by date
CREATE INDEX IF NOT EXISTS idx_clicks_site_created
  ON affiliate_clicks(site_id, created_at DESC);

-- Audit log: filtered listing by site + action
CREATE INDEX IF NOT EXISTS idx_audit_log_site_action
  ON audit_log(site_id, action, created_at DESC);

-- Scheduled jobs: listing with status filter
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_site_status
  ON scheduled_jobs(site_id, status, scheduled_for);

-- Products: listing with category filter
CREATE INDEX IF NOT EXISTS idx_products_site_status_category
  ON products(site_id, status, category_id);

-- Ad placements: active placements by type
CREATE INDEX IF NOT EXISTS idx_ad_placements_site_type_active
  ON ad_placements(site_id, placement_type, is_active)
  WHERE is_active = true;
