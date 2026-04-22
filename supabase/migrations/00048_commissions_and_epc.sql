-- ============================================================
-- Migration 00048: Commission reports + EPC tracking
-- Weeks 3-6 §2.4 — Affiliate link router with real-time EPC optimization
-- ============================================================

-- Ingested commission reports from CJ / Admitad / PartnerStack / direct
CREATE TABLE IF NOT EXISTS commissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  product_id      UUID REFERENCES products(id) ON DELETE SET NULL,
  network         TEXT NOT NULL,           -- 'cj', 'admitad', 'partnerstack', 'direct'
  order_id        TEXT,                    -- network's order ID
  click_id        TEXT,                    -- our click ID if available
  commission_amount NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
  sale_amount     NUMERIC(12,2),           -- gross sale value
  event_date      TIMESTAMPTZ NOT NULL,    -- when the sale happened
  ingested_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_data        JSONB,                   -- full raw report row for debugging
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commissions_product
  ON commissions (product_id, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_commissions_network
  ON commissions (network, event_date DESC);

CREATE INDEX IF NOT EXISTS idx_commissions_site
  ON commissions (site_id, event_date DESC);

-- Prevent duplicate ingestion
CREATE UNIQUE INDEX IF NOT EXISTS idx_commissions_dedup
  ON commissions (network, order_id) WHERE order_id IS NOT NULL;

-- Materialized EPC (earnings per click) per product per network
-- Recomputed nightly by cron after commission ingestion
CREATE TABLE IF NOT EXISTS product_epc_stats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id      UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  network         TEXT NOT NULL,
  clicks_30d      INT NOT NULL DEFAULT 0,
  commissions_30d NUMERIC(12,2) NOT NULL DEFAULT 0,
  epc_30d         NUMERIC(8,4) NOT NULL DEFAULT 0,  -- commissions / clicks
  clicks_7d       INT NOT NULL DEFAULT 0,
  commissions_7d  NUMERIC(12,2) NOT NULL DEFAULT 0,
  epc_7d          NUMERIC(8,4) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, network)
);

CREATE INDEX IF NOT EXISTS idx_product_epc_product
  ON product_epc_stats (product_id, epc_30d DESC);

-- RLS
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_epc_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_commissions" ON commissions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "service_role_product_epc" ON product_epc_stats FOR ALL USING (true) WITH CHECK (true);
