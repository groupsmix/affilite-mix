-- ============================================================
-- Migration 00046: Price snapshots + price-drop alert subscriptions
-- Weeks 3-6 §2.1 — Price history + price-drop alerts
-- ============================================================

-- Daily price snapshots scraped from merchant/affiliate sources
CREATE TABLE IF NOT EXISTS price_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  price_amount  NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  source        TEXT NOT NULL DEFAULT 'direct',  -- 'direct', 'cj', 'amazon', 'chrono24', etc.
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_product_date
  ON price_snapshots (product_id, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_site
  ON price_snapshots (site_id, scraped_at DESC);

-- Price-drop alert subscriptions
CREATE TABLE IF NOT EXISTS price_alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  site_id       UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  target_price  NUMERIC(12,2) NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'USD',
  is_active     BOOLEAN NOT NULL DEFAULT true,
  triggered_at  TIMESTAMPTZ,            -- set when alert fires
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_product
  ON price_alerts (product_id, is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_price_alerts_email
  ON price_alerts (email, site_id);

-- Unique constraint: one alert per email per product
CREATE UNIQUE INDEX IF NOT EXISTS idx_price_alerts_unique_sub
  ON price_alerts (product_id, email) WHERE is_active = true;

-- RLS policies (service_role only for now)
ALTER TABLE price_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_price_snapshots" ON price_snapshots
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_price_alerts" ON price_alerts
  FOR ALL USING (true) WITH CHECK (true);
