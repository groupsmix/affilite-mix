-- ═══════════════════════════════════════════════════════
-- Migration 00000: Baseline Repair
-- ═══════════════════════════════════════════════════════
--
-- This migration brings a manually-created database to a state compatible
-- with the migration chain 00001–00035.  It is fully idempotent: on a
-- fresh database every statement is a harmless no-op (DROP IF EXISTS on
-- objects that don't exist, ADD COLUMN IF NOT EXISTS on columns that
-- won't be there yet).
--
-- On an existing database that was set up before the numbered migration
-- chain, this migration:
--   1. Drops old indexes that migration 00001 recreates (00001 uses bare
--      CREATE INDEX, not IF NOT EXISTS).
--   2. Fixes CHECK constraints whose allowed values differ from what
--      00001 defines (products.status, content.status, content.type,
--      content_products.role, newsletter_subscribers.status).
--   3. Drops old-style RLS policies so 00001 / 00003 / 00020–00035 can
--      recreate them with correct definitions.
--   4. Adds columns that 00001's CREATE TABLE IF NOT EXISTS would create
--      on a fresh DB but skips on an existing table.
--   5. Removes the sites.domain UNIQUE constraint (multi-site routing
--      allows empty/shared domain values).
-- ═══════════════════════════════════════════════════════

-- ── 1. Drop conflicting indexes ──────────────────────────────────────
-- These will be recreated by migration 00001 with correct definitions.
DROP INDEX IF EXISTS idx_categories_site;

DROP INDEX IF EXISTS idx_categories_slug;

DROP INDEX IF EXISTS idx_products_site;

DROP INDEX IF EXISTS idx_products_slug;

DROP INDEX IF EXISTS idx_products_status;

DROP INDEX IF EXISTS idx_products_featured;

DROP INDEX IF EXISTS idx_products_category;

DROP INDEX IF EXISTS idx_content_site;

DROP INDEX IF EXISTS idx_content_slug;

DROP INDEX IF EXISTS idx_content_status;

DROP INDEX IF EXISTS idx_content_type;

DROP INDEX IF EXISTS idx_content_category;

DROP INDEX IF EXISTS idx_content_fts;

DROP INDEX IF EXISTS idx_content_products_product;

DROP INDEX IF EXISTS idx_newsletter_site;

DROP INDEX IF EXISTS idx_newsletter_site_email;

DROP INDEX IF EXISTS idx_affiliate_clicks_site;

DROP INDEX IF EXISTS idx_affiliate_clicks_created;

DROP INDEX IF EXISTS idx_clicks_site;

DROP INDEX IF EXISTS idx_clicks_created;

DROP INDEX IF EXISTS idx_scheduled_jobs_site;

DROP INDEX IF EXISTS idx_scheduled_jobs_pending;

DROP INDEX IF EXISTS idx_admin_users_email;

DROP INDEX IF EXISTS idx_audit_log_site;

DROP INDEX IF EXISTS idx_audit_log_actor;

DROP INDEX IF EXISTS idx_audit_site;

-- ── 2. Fix CHECK constraints ─────────────────────────────────────────
-- Products status: old DB may have ('active','inactive'); expected: ('draft','active','archived')
DO $$ BEGIN
  UPDATE products SET status = 'archived' WHERE status = 'inactive';
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE IF EXISTS products DROP CONSTRAINT IF EXISTS products_status_check;

-- Content status: old DB may have ('draft','published'); expected adds 'review','scheduled','archived'
ALTER TABLE IF EXISTS content DROP CONSTRAINT IF EXISTS content_status_check;

-- Content type: old DB may be missing 'blog'
ALTER TABLE IF EXISTS content DROP CONSTRAINT IF EXISTS content_type_check;

-- Content-products role: old DB may have ('hero','mention','comparison')
DO $$ BEGIN
  UPDATE content_products SET role = 'related'
    WHERE role NOT IN ('hero', 'featured', 'related', 'vs-left', 'vs-right');
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE IF EXISTS content_products DROP CONSTRAINT IF EXISTS content_products_role_check;

-- Newsletter status: old DB may be missing 'pending'
ALTER TABLE IF EXISTS newsletter_subscribers DROP CONSTRAINT IF EXISTS newsletter_subscribers_status_check;

-- ── 3. Drop old-style RLS policies ───────────────────────────────────
-- Old manually-created policies (title-case names from early SQL editor setup)
DROP POLICY IF EXISTS "Public read sites" ON sites;

DROP POLICY IF EXISTS "Public read categories" ON categories;

DROP POLICY IF EXISTS "Public read products" ON products;

DROP POLICY IF EXISTS "Public read published content" ON content;

DROP POLICY IF EXISTS "Public read content_products" ON content_products;

DROP POLICY IF EXISTS "Insert affiliate clicks" ON affiliate_clicks;

DROP POLICY IF EXISTS "Service full access affiliate_clicks" ON affiliate_clicks;

DROP POLICY IF EXISTS "Service full access categories" ON categories;

DROP POLICY IF EXISTS "Service full access content" ON content;

DROP POLICY IF EXISTS "Service full access content_products" ON content_products;

DROP POLICY IF EXISTS "Service full access products" ON products;

DROP POLICY IF EXISTS "Service full access sites" ON sites;

-- service_full_access_* policies that may exist with USING(true) instead of
-- auth.role() = 'service_role' — drop so 00003 can recreate correctly
DROP POLICY IF EXISTS "service_full_access_categories" ON categories;

DROP POLICY IF EXISTS "service_full_access_products" ON products;

DROP POLICY IF EXISTS "service_full_access_content" ON content;

DROP POLICY IF EXISTS "service_full_access_content_products" ON content_products;

DROP POLICY IF EXISTS "service_full_access_clicks" ON affiliate_clicks;

DROP POLICY IF EXISTS "service_full_access_newsletter" ON newsletter_subscribers;

DROP POLICY IF EXISTS "service_full_access_scheduled_jobs" ON scheduled_jobs;

DROP POLICY IF EXISTS "service_full_access_audit_log" ON audit_log;

-- ── 4. Add missing columns ───────────────────────────────────────────
-- Products columns that 00001 defines in CREATE TABLE but can't add when
-- the table already exists (IF NOT EXISTS skips the whole statement).
ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS image_alt text DEFAULT '';

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS price_amount numeric;

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS price_currency text DEFAULT 'USD';

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS cta_text text DEFAULT '';

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS deal_text text DEFAULT '';

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS deal_expires_at timestamptz;

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS pros text DEFAULT '';

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS cons text DEFAULT '';

ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Content columns
ALTER TABLE IF EXISTS content ADD COLUMN IF NOT EXISTS featured_image text DEFAULT '';

ALTER TABLE IF EXISTS content ADD COLUMN IF NOT EXISTS publish_at timestamptz;

ALTER TABLE IF EXISTS content ADD COLUMN IF NOT EXISTS meta_title text;

ALTER TABLE IF EXISTS content ADD COLUMN IF NOT EXISTS meta_description text;

ALTER TABLE IF EXISTS content ADD COLUMN IF NOT EXISTS og_image text;

-- Newsletter columns
ALTER TABLE IF EXISTS newsletter_subscribers ADD COLUMN IF NOT EXISTS confirmation_token text;

ALTER TABLE IF EXISTS newsletter_subscribers ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

-- Sites column
ALTER TABLE IF EXISTS sites ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ── 5. Remove sites.domain UNIQUE constraint ─────────────────────────
-- Multi-site routing allows empty or shared domain values; the UNIQUE
-- constraint from the original manual setup must be dropped.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sites_domain_key') THEN
    ALTER TABLE sites DROP CONSTRAINT sites_domain_key;
  END IF;
END $$;

-- Also set a permissive default so the column isn't NOT NULL without a value
ALTER TABLE IF EXISTS sites ALTER COLUMN domain SET DEFAULT '';
