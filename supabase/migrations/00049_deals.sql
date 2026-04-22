-- ============================================================
-- Migration 00049: Deals system
-- Weeks 7-10 §2.5 — Deals-of-the-day page + daily deals email
-- ============================================================

CREATE TABLE IF NOT EXISTS deals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  discount_pct    INT,                     -- e.g. 25 for 25% off
  original_price  NUMERIC(12,2),
  deal_price      NUMERIC(12,2),
  currency        TEXT NOT NULL DEFAULT 'USD',
  source          TEXT,                    -- 'grey_market', 'factory', 'retailer', etc.
  url             TEXT NOT NULL,           -- direct deal URL or affiliate link
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,             -- null = no expiry
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_site_active
  ON deals (site_id, is_active, starts_at DESC) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_deals_expires
  ON deals (expires_at) WHERE expires_at IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_deals_product
  ON deals (product_id) WHERE product_id IS NOT NULL;

-- RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_deals" ON deals FOR ALL USING (true) WITH CHECK (true);
