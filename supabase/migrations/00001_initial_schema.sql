-- NicheHub Affiliate Platform — Initial Schema
-- This migration creates all tables, indexes, RLS policies, and RPC functions
-- required by the application.

-- ── Sites ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  domain      TEXT NOT NULL UNIQUE,
  language    TEXT NOT NULL DEFAULT 'en',
  direction   TEXT NOT NULL DEFAULT 'ltr' CHECK (direction IN ('ltr', 'rtl')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  slug           TEXT NOT NULL,
  description    TEXT NOT NULL DEFAULT '',
  taxonomy_type  TEXT NOT NULL DEFAULT 'general'
                   CHECK (taxonomy_type IN ('general', 'budget', 'occasion', 'recipient', 'brand')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE INDEX idx_categories_site ON categories(site_id);

-- ── Products ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  affiliate_url   TEXT NOT NULL DEFAULT '',
  image_url       TEXT NOT NULL DEFAULT '',
  image_alt       TEXT NOT NULL DEFAULT '',
  price           TEXT NOT NULL DEFAULT '',
  price_amount    NUMERIC,
  price_currency  TEXT NOT NULL DEFAULT 'USD',
  merchant        TEXT NOT NULL DEFAULT '',
  score           NUMERIC CHECK (score IS NULL OR (score >= 0 AND score <= 10)),
  featured        BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  cta_text        TEXT NOT NULL DEFAULT '',
  deal_text       TEXT NOT NULL DEFAULT '',
  deal_expires_at TIMESTAMPTZ,
  pros            TEXT NOT NULL DEFAULT '',
  cons            TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE INDEX idx_products_site ON products(site_id);
CREATE INDEX idx_products_status ON products(site_id, status);
CREATE INDEX idx_products_featured ON products(site_id, featured) WHERE featured = true;
CREATE INDEX idx_products_category ON products(category_id);

-- ── Content ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id          UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  slug             TEXT NOT NULL,
  body             TEXT NOT NULL DEFAULT '',
  excerpt          TEXT NOT NULL DEFAULT '',
  featured_image   TEXT NOT NULL DEFAULT '',
  type             TEXT NOT NULL DEFAULT 'article'
                     CHECK (type IN ('article', 'review', 'comparison', 'guide', 'blog')),
  status           TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'review', 'published', 'scheduled', 'archived')),
  category_id      UUID REFERENCES categories(id) ON DELETE SET NULL,
  tags             TEXT[] NOT NULL DEFAULT '{}',
  author           TEXT,
  publish_at       TIMESTAMPTZ,
  meta_title       TEXT,
  meta_description TEXT,
  og_image         TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE INDEX idx_content_site ON content(site_id);
CREATE INDEX idx_content_status ON content(site_id, status);
CREATE INDEX idx_content_type ON content(site_id, type);
CREATE INDEX idx_content_category ON content(category_id);

-- Full-text search index for content
CREATE INDEX idx_content_fts ON content
  USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(body, '')));

-- ── Content ↔ Product link table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_products (
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'featured'
               CHECK (role IN ('hero', 'featured', 'related', 'vs-left', 'vs-right')),
  PRIMARY KEY (content_id, product_id)
);

-- ── Affiliate Clicks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_name  TEXT NOT NULL DEFAULT '',
  affiliate_url TEXT NOT NULL DEFAULT '',
  content_slug  TEXT NOT NULL DEFAULT '',
  referrer      TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clicks_site ON affiliate_clicks(site_id);
CREATE INDEX idx_clicks_created ON affiliate_clicks(site_id, created_at DESC);

-- ── Admin Users ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                   TEXT NOT NULL UNIQUE,
  password_hash           TEXT NOT NULL,
  name                    TEXT NOT NULL DEFAULT '',
  role                    TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  is_active               BOOLEAN NOT NULL DEFAULT true,
  reset_token             TEXT,
  reset_token_expires_at  TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Newsletter Subscribers ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id             UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  confirmation_token  TEXT,
  confirmed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, email)
);

CREATE INDEX idx_newsletter_site ON newsletter_subscribers(site_id);
CREATE INDEX idx_newsletter_token ON newsletter_subscribers(confirmation_token) WHERE confirmation_token IS NOT NULL;

-- ── Audit Log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id    UUID REFERENCES sites(id) ON DELETE SET NULL,
  user_id    UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL DEFAULT '',
  entity_id  TEXT NOT NULL DEFAULT '',
  details    JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_site ON audit_log(site_id, created_at DESC);

-- ── RLS Policies ─────────────────────────────────────────────────────
-- Enable RLS on all tables
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Public read access for published content (anon key)
CREATE POLICY "Public can read sites" ON sites FOR SELECT USING (true);
CREATE POLICY "Public can read categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Public can read active products" ON products FOR SELECT USING (status = 'active');
CREATE POLICY "Public can read published content" ON content FOR SELECT USING (status = 'published');
CREATE POLICY "Public can read content_products" ON content_products FOR SELECT USING (true);

-- Service role bypass (for admin operations via service_role key)
-- The service_role key bypasses RLS by default in Supabase.

-- ── RPC Functions ────────────────────────────────────────────────────

-- Top products by click count
CREATE OR REPLACE FUNCTION top_products_by_clicks(p_site_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE(product_name TEXT, click_count BIGINT) AS $$
  SELECT product_name, COUNT(*) AS click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id
  GROUP BY product_name
  ORDER BY click_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- Top referrers
CREATE OR REPLACE FUNCTION top_referrers(p_site_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE(referrer TEXT, referral_count BIGINT) AS $$
  SELECT referrer, COUNT(*) AS referral_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND referrer != ''
  GROUP BY referrer
  ORDER BY referral_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- Top content by clicks
CREATE OR REPLACE FUNCTION top_content_by_clicks(p_site_id UUID, p_limit INT DEFAULT 10)
RETURNS TABLE(content_slug TEXT, click_count BIGINT) AS $$
  SELECT content_slug, COUNT(*) AS click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND content_slug != ''
  GROUP BY content_slug
  ORDER BY click_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;
