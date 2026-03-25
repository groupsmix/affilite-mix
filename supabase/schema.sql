-- ═══════════════════════════════════════════════════════
-- NicheHub — Slice 1 Schema
-- Excludes: newsletter_subscribers, scheduled_jobs
-- ═══════════════════════════════════════════════════════

-- SITES — master registry
CREATE TABLE sites (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  domain      text NOT NULL UNIQUE,
  language    text NOT NULL DEFAULT 'en',
  direction   text NOT NULL DEFAULT 'ltr',
  locale      text NOT NULL DEFAULT 'en_US',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

-- CATEGORIES
CREATE TABLE categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id     text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        text NOT NULL,
  slug        text NOT NULL,
  description text DEFAULT '',
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(site_id, slug)
);

-- PRODUCTS
CREATE TABLE products (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id       text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name          text NOT NULL,
  slug          text NOT NULL,
  description   text DEFAULT '',
  affiliate_url text DEFAULT '',
  image_url     text DEFAULT '',
  price         text DEFAULT '',
  merchant      text DEFAULT '',
  score         real CHECK (score >= 0 AND score <= 10),
  is_featured   boolean DEFAULT false,
  is_active     boolean DEFAULT true,
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('draft', 'active', 'archived')),
  category_id   uuid REFERENCES categories(id) ON DELETE SET NULL,
  metadata      jsonb DEFAULT '{}',
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now(),
  UNIQUE(site_id, slug)
);

-- CONTENT
CREATE TABLE content (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id          text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  title            text NOT NULL,
  slug             text NOT NULL,
  body             text DEFAULT '',
  excerpt          text DEFAULT '',
  content_type     text NOT NULL DEFAULT 'article'
                   CHECK (content_type IN (
                     'article', 'review', 'comparison', 'guide', 'blog',
                     'brand-spotlight', 'occasion', 'budget', 'recipient'
                   )),
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'review', 'published', 'archived')),
  category_id      uuid REFERENCES categories(id) ON DELETE SET NULL,
  featured_image   text,
  meta_title       text,
  meta_description text,
  tags             text[] DEFAULT '{}',
  published_at     timestamptz,
  author           text,
  metadata         jsonb DEFAULT '{}',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE(site_id, slug)
);

-- CONTENT <-> PRODUCTS (many-to-many)
CREATE TABLE content_products (
  content_id     uuid NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  product_id     uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  site_id        text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  position       int DEFAULT 0,
  role           text DEFAULT 'related'
                 CHECK (role IN ('hero', 'featured', 'related', 'vs-left', 'vs-right')),
  custom_aff_url text,
  PRIMARY KEY (content_id, product_id)
);

-- AFFILIATE CLICK TRACKING
CREATE TABLE affiliate_clicks (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  site_id         text NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_id      uuid REFERENCES products(id) ON DELETE SET NULL,
  product_slug    text DEFAULT '',
  source_page     text DEFAULT '',
  source_type     text DEFAULT 'unknown',
  destination_url text DEFAULT '',
  ip_hash         text,
  user_agent      text,
  referrer        text,
  country         text,
  created_at      timestamptz DEFAULT now()
);

-- ═══════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════

CREATE INDEX idx_categories_site        ON categories(site_id);
CREATE INDEX idx_products_site          ON products(site_id);
CREATE INDEX idx_products_site_slug     ON products(site_id, slug);
CREATE INDEX idx_products_site_featured ON products(site_id, is_featured)
  WHERE is_featured = true;
CREATE INDEX idx_products_active        ON products(site_id, is_active)
  WHERE is_active = true;
CREATE INDEX idx_content_site           ON content(site_id);
CREATE INDEX idx_content_site_status    ON content(site_id, status);
CREATE INDEX idx_content_site_slug      ON content(site_id, slug);
CREATE INDEX idx_content_site_type      ON content(site_id, content_type);
CREATE INDEX idx_content_published      ON content(site_id, published_at DESC)
  WHERE status = 'published';
CREATE INDEX idx_clicks_site            ON affiliate_clicks(site_id);
CREATE INDEX idx_clicks_created         ON affiliate_clicks(created_at DESC);
CREATE INDEX idx_clicks_product         ON affiliate_clicks(product_id);

-- ═══════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════

ALTER TABLE sites             ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE products          ENABLE ROW LEVEL SECURITY;
ALTER TABLE content           ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_products  ENABLE ROW LEVEL SECURITY;
ALTER TABLE affiliate_clicks  ENABLE ROW LEVEL SECURITY;

-- Public read policies (anon key)
CREATE POLICY "public_read_sites"
  ON sites FOR SELECT USING (is_active = true);

CREATE POLICY "public_read_categories"
  ON categories FOR SELECT USING (true);

CREATE POLICY "public_read_active_products"
  ON products FOR SELECT USING (is_active = true AND status = 'active');

CREATE POLICY "public_read_published_content"
  ON content FOR SELECT USING (status = 'published');

CREATE POLICY "public_read_content_products"
  ON content_products FOR SELECT USING (true);

-- Anonymous write policies (public actions)
CREATE POLICY "public_insert_clicks"
  ON affiliate_clicks FOR INSERT WITH CHECK (true);

-- Note: All admin operations use the Supabase service key (bypasses RLS).

-- ═══════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER content_updated_at
  BEFORE UPDATE ON content
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════
-- SEED: arabic-tools site
-- ═══════════════════════════════════════════════════════

INSERT INTO sites (id, name, domain, language, direction, locale)
VALUES ('arabic-tools', 'Arabic Tools', 'arabic-tools.example.com', 'ar', 'rtl', 'ar_SA');
