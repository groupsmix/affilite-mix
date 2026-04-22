-- ── Authors table (EEAT: bio, photo, credentials) ─────────────────────
CREATE TABLE IF NOT EXISTS authors (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  bio         TEXT NOT NULL DEFAULT '',
  photo_url   TEXT NOT NULL DEFAULT '',
  credentials TEXT NOT NULL DEFAULT '',
  expertise   TEXT[] NOT NULL DEFAULT '{}',
  social_links JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, slug)
);

CREATE INDEX idx_authors_site ON authors(site_id);
CREATE INDEX idx_authors_active ON authors(site_id, is_active) WHERE is_active = true;

-- Add author_id FK to content (nullable — existing content has no author yet)
ALTER TABLE content
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES authors(id) ON DELETE SET NULL;

CREATE INDEX idx_content_author ON content(author_id) WHERE author_id IS NOT NULL;

-- Backfill: for rows that have a text `author` value, we leave them as-is.
-- The text `author` column is kept for backward compatibility during migration.
-- Future code should use author_id → authors table for structured author data.

-- ── Product affiliate links (1:N, per-network, per-geo) ──────────────
CREATE TABLE IF NOT EXISTS product_affiliate_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  network     TEXT NOT NULL DEFAULT 'direct',
  geo         TEXT NOT NULL DEFAULT '*',
  url         TEXT NOT NULL,
  weight      INTEGER NOT NULL DEFAULT 100 CHECK (weight >= 0 AND weight <= 1000),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_affiliate_links_product ON product_affiliate_links(product_id);
CREATE INDEX idx_product_affiliate_links_active ON product_affiliate_links(product_id, is_active)
  WHERE is_active = true;

-- Migrate existing affiliate_url values into the new table.
-- Only creates a row when the product has a non-empty affiliate_url.
INSERT INTO product_affiliate_links (product_id, network, geo, url, weight, is_active)
SELECT id, 'direct', '*', affiliate_url, 100, true
FROM products
WHERE affiliate_url IS NOT NULL AND affiliate_url != ''
ON CONFLICT DO NOTHING;

-- RLS policies (service_role only — admin manages via API)
ALTER TABLE authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_affiliate_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY authors_service_all ON authors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY product_affiliate_links_service_all ON product_affiliate_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);
