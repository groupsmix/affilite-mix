-- ═══════════════════════════════════════════════════════
-- Layer 2 Audit Fixes: Harden RLS Policies & Add Missing Indexes
-- ═══════════════════════════════════════════════════════
--
-- 2.2 (HIGH): Replace overly permissive USING(true) service policies with
--   USING (auth.role() = 'service_role') so that an exposed anon key cannot
--   read/write admin-only tables.
--
-- 2.3 (MEDIUM): Add composite indexes to support common query patterns
--   identified in the DAL (content listing, slug lookup, product listing,
--   newsletter uniqueness).
-- ═══════════════════════════════════════════════════════

-- ─── 2.2  Harden RLS service-role policies ───────────────

-- LIVE-05 fix: each block is wrapped in a `to_regclass IS NOT NULL`
-- guard so a fresh DB that doesn't yet have the table at replay time
-- skips the policy instead of erroring out.

-- ad_placements
DO $$ BEGIN
  IF to_regclass('public.ad_placements') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ad_placements_service_all" ON ad_placements;
    CREATE POLICY "ad_placements_service_all" ON ad_placements
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ad_impressions
DO $$ BEGIN
  IF to_regclass('public.ad_impressions') IS NOT NULL THEN
    DROP POLICY IF EXISTS "ad_impressions_service_all" ON ad_impressions;
    CREATE POLICY "ad_impressions_service_all" ON ad_impressions
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- shared_content
DO $$ BEGIN
  IF to_regclass('public.shared_content') IS NOT NULL THEN
    DROP POLICY IF EXISTS "shared_content_service_all" ON shared_content;
    CREATE POLICY "shared_content_service_all" ON shared_content
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- niche_templates
DO $$ BEGIN
  IF to_regclass('public.niche_templates') IS NOT NULL THEN
    DROP POLICY IF EXISTS "niche_templates_service_all" ON niche_templates;
    CREATE POLICY "niche_templates_service_all" ON niche_templates
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- Harden the defense-in-depth policies from migration 00003
DO $$ BEGIN
  IF to_regclass('public.categories') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_full_access_categories" ON categories;
    CREATE POLICY "service_full_access_categories" ON categories
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_full_access_products" ON products;
    CREATE POLICY "service_full_access_products" ON products
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.content') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_full_access_content" ON content;
    CREATE POLICY "service_full_access_content" ON content
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.content_products') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_full_access_content_products" ON content_products;
    CREATE POLICY "service_full_access_content_products" ON content_products
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.affiliate_clicks') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_full_access_clicks" ON affiliate_clicks;
    CREATE POLICY "service_full_access_clicks" ON affiliate_clicks
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_full_access_newsletter" ON newsletter_subscribers;
    CREATE POLICY "service_full_access_newsletter" ON newsletter_subscribers
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.scheduled_jobs') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_full_access_scheduled_jobs" ON scheduled_jobs;
    CREATE POLICY "service_full_access_scheduled_jobs" ON scheduled_jobs
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

DO $$ BEGIN
  IF to_regclass('public.audit_log') IS NOT NULL THEN
    DROP POLICY IF EXISTS "service_full_access_audit_log" ON audit_log;
    CREATE POLICY "service_full_access_audit_log" ON audit_log
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ─── 2.3  Add missing composite indexes ─────────────────

-- Content: queries filter by (site_id, status, type) in listContent
CREATE INDEX IF NOT EXISTS idx_content_site_status_type ON content(site_id, status, type);

-- Content: slug lookups filter by (site_id, slug)
CREATE INDEX IF NOT EXISTS idx_content_site_slug ON content(site_id, slug);

-- Products: queries filter by (site_id, status) — already exists as idx_products_status
-- but adding a covering index for (site_id, status, featured) for dashboard queries
CREATE INDEX IF NOT EXISTS idx_products_site_status_featured ON products(site_id, status, featured);

-- Newsletter: enforce uniqueness per site + email to prevent duplicate subscriptions
CREATE UNIQUE INDEX IF NOT EXISTS idx_newsletter_site_email ON newsletter_subscribers(site_id, email);
