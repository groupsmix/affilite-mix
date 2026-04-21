-- ═══════════════════════════════════════════════════════════
-- Affilite-Mix — E2E Test Seed Data
-- ═══════════════════════════════════════════════════════════
-- This seed creates minimal test data for Playwright e2e tests.
-- It is safe to run repeatedly (uses ON CONFLICT DO NOTHING).

BEGIN;

-- ── Sites ──────────────────────────────────────────────────
INSERT INTO sites (slug, name, domain, language, direction, is_active, monetization_type, est_revenue_per_click, theme, nav_items, footer_nav, features, meta_title, meta_description)
VALUES (
  'watch-tools',
  'WristNerd',
  'wristnerd.xyz',
  'en',
  'ltr',
  true,
  'affiliate',
  0.35,
  '{"primaryColor": "#1B2A4A", "accentColor": "#C9A96E", "accentTextColor": "#8B6914", "fontHeading": "Playfair Display", "fontBody": "Inter"}',
  '[{"label": "Home", "href": "/"}, {"label": "Reviews", "href": "/review"}, {"label": "Comparisons", "href": "/comparison"}, {"label": "Guides", "href": "/guide"}, {"label": "Gift Finder", "href": "/gift-finder"}]',
  '[{"label": "Home", "href": "/"}, {"label": "Reviews", "href": "/review"}, {"label": "About", "href": "/about"}, {"label": "Privacy Policy", "href": "/privacy"}, {"label": "Terms of Service", "href": "/terms"}]',
  '{"blog": true, "brandSpotlights": true, "comparisons": true, "cookieConsent": true, "deals": true, "giftFinder": true, "newsletter": true, "rssFeed": true, "scheduling": true, "searchModal": true, "taxonomyPages": true}',
  'WristNerd — Watch Gift Guides & Reviews',
  'Expert watch gift guides and reviews — honest ratings and a proprietary Gift-Worthiness Score to help you pick the perfect watch.'
)
ON CONFLICT (slug) DO NOTHING;

-- ── Categories for watch-tools ─────────────────────────────────
WITH wt AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO categories (site_id, name, slug, taxonomy_type)
SELECT wt.id, 'Dress Watches', 'dress-watches', 'general' FROM wt
ON CONFLICT (site_id, slug) DO NOTHING;

WITH wt AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO categories (site_id, name, slug, taxonomy_type)
SELECT wt.id, 'Sports Watches', 'sports-watches', 'general' FROM wt
ON CONFLICT (site_id, slug) DO NOTHING;

WITH wt AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO categories (site_id, name, slug, taxonomy_type)
SELECT wt.id, 'Budget Friendly', 'budget-friendly', 'budget' FROM wt
ON CONFLICT (site_id, slug) DO NOTHING;

WITH wt AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO categories (site_id, name, slug, taxonomy_type)
SELECT wt.id, 'For Him', 'for-him', 'recipient' FROM wt
ON CONFLICT (site_id, slug) DO NOTHING;

WITH wt AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO categories (site_id, name, slug, taxonomy_type)
SELECT wt.id, 'For Her', 'for-her', 'recipient' FROM wt
ON CONFLICT (site_id, slug) DO NOTHING;

-- ── Products for watch-tools ─────────────────────────────────
-- Note: both the legacy varchar `price` column and the numeric
-- `price_amount` / `price_currency` columns (added in migration
-- 00010_add_price_columns.sql) are populated so test fixtures work on
-- code paths that read either representation.
WITH wt AS (SELECT id FROM sites WHERE slug = 'watch-tools'),
     cat AS (SELECT id FROM categories WHERE slug = 'dress-watches')
INSERT INTO products (
  site_id, category_id, name, slug, description,
  price, price_amount, price_currency,
  merchant, score, featured, status
)
SELECT wt.id, cat.id, 'Seiko Presage', 'seiko-presage',
       'Classic dress watch with automatic movement',
       '$350', 350, 'USD',
       'Amazon', 8.5, true, 'active'
FROM wt, cat
ON CONFLICT (site_id, slug) DO NOTHING;

WITH wt AS (SELECT id FROM sites WHERE slug = 'watch-tools'),
     cat AS (SELECT id FROM categories WHERE slug = 'sports-watches')
INSERT INTO products (
  site_id, category_id, name, slug, description,
  price, price_amount, price_currency,
  merchant, score, featured, status
)
SELECT wt.id, cat.id, 'Casio G-Shock', 'casio-g-shock',
       'Rugged sports watch with atomic sync',
       '$120', 120, 'USD',
       'Amazon', 9.0, true, 'active'
FROM wt, cat
ON CONFLICT (site_id, slug) DO NOTHING;

-- ── Content for watch-tools ─────────────────────────────────
WITH wt AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO content (site_id, title, slug, excerpt, type, status)
SELECT wt.id, 'Best Dress Watches Under $500', 'best-dress-watches-under-500', 'A curated guide to the finest dress watches that wont break the bank.', 'guide', 'published'
FROM wt
ON CONFLICT (site_id, slug) DO NOTHING;

WITH wt AS (SELECT id FROM sites WHERE slug = 'watch-tools')
INSERT INTO content (site_id, title, slug, excerpt, type, status)
SELECT wt.id, 'Seiko Presage Review', 'seiko-presage-review', 'An in-depth review of the Seiko Presage lineup.', 'review', 'published'
FROM wt
ON CONFLICT (site_id, slug) DO NOTHING;

-- ── Content <-> Products ─────────────────────────────────────
WITH ct AS (SELECT id FROM content WHERE slug = 'seiko-presage-review'),
     pt AS (SELECT id FROM products WHERE slug = 'seiko-presage')
INSERT INTO content_products (content_id, product_id, role)
SELECT ct.id, pt.id, 'hero'
FROM ct, pt
ON CONFLICT (content_id, product_id) DO NOTHING;

COMMIT;
