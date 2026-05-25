-- ============================================================================
-- Migration 00099: Comprehensive fixes for audit findings A26-A30
--
-- A26: Normalization tradeoffs
-- A27: Soft-delete consistency  
-- A28: Time/timezone safety
-- A29: Numeric precision
-- A30: Replication/sharding resilience
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- A28-003: DB now() RPC for authoritative scheduling decisions
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION db_now()
RETURNS TIMESTAMPTZ
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT now();
$$;

COMMENT ON FUNCTION db_now() IS 
  'Returns the current database server time. Use this instead of worker/edge clock for scheduling decisions to avoid clock skew issues.';

GRANT EXECUTE ON FUNCTION db_now() TO authenticated;
GRANT EXECUTE ON FUNCTION db_now() TO service_role;
GRANT EXECUTE ON FUNCTION db_now() TO anon;
-- 
-- A26: Normalization tradeoffs
-- A27: Soft-delete consistency  
-- A28: Time/timezone safety
-- A29: Numeric precision
-- A30: Replication/sharding resilience
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- A26-001: Product price normalization — make structured amount/currency canonical
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to generate display price text from structured fields
CREATE OR REPLACE FUNCTION generate_price_display(
  p_amount NUMERIC,
  p_currency TEXT
) RETURNS TEXT AS $$
DECLARE
  v_symbol TEXT;
BEGIN
  -- Map common currency codes to symbols; fallback to code + space
  v_symbol := CASE UPPER(TRIM(COALESCE(p_currency, 'USD')))
    WHEN 'USD' THEN '$'
    WHEN 'EUR' THEN '€'
    WHEN 'GBP' THEN '£'
    WHEN 'JPY' THEN '¥'
    WHEN 'CAD' THEN 'C$'
    WHEN 'AUD' THEN 'A$'
    WHEN 'CHF' THEN 'Fr '
    WHEN 'CNY' THEN '¥'
    WHEN 'INR' THEN '₹'
    WHEN 'KRW' THEN '₩'
    WHEN 'BRL' THEN 'R$'
    ELSE UPPER(TRIM(COALESCE(p_currency, 'USD'))) || ' '
  END;

  IF p_amount IS NULL THEN
    RETURN '';
  END IF;

  -- Format with 2 decimal places, stripping trailing zeros for whole numbers
  IF p_amount = FLOOR(p_amount) THEN
    RETURN v_symbol || TO_CHAR(FLOOR(p_amount), 'FM999G999G999G999');
  ELSE
    RETURN v_symbol || TO_CHAR(p_amount, 'FM999G999G999G990.00');
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger function: auto-sync price text from structured fields
CREATE OR REPLACE FUNCTION sync_price_display()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-generate if the caller didn't explicitly set a custom price
  -- If price_amount changes, update price text to match
  IF TG_OP = 'INSERT' OR 
     (TG_OP = 'UPDATE' AND (
        NEW.price_amount IS DISTINCT FROM OLD.price_amount OR
        NEW.price_currency IS DISTINCT FROM OLD.price_currency
      )) THEN
    NEW.price := generate_price_display(NEW.price_amount, NEW.price_currency);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the trigger to products table
DROP TRIGGER IF EXISTS products_sync_price ON products;
CREATE TRIGGER products_sync_price
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW
  EXECUTE FUNCTION sync_price_display();

-- Backfill existing products: regenerate price from structured fields
UPDATE products
SET price = generate_price_display(price_amount, price_currency)
WHERE price_amount IS NOT NULL;

-- Add check constraint to ensure price_amount has proper scale/precision
ALTER TABLE products 
  ADD CONSTRAINT chk_price_amount_scale 
  CHECK (price_amount IS NULL OR (
    price_amount >= 0 AND 
    price_amount <= 999999999.99 AND
    price_amount = ROUND(price_amount, 2)
  ))
  NOT VALID;

-- ═══════════════════════════════════════════════════════════════════════════
-- A26-003: Normalize core commission fields from raw JSONB
-- ═══════════════════════════════════════════════════════════════════════════

-- Add normalized columns for core commission fields extracted from raw_data
ALTER TABLE commissions
  ADD COLUMN IF NOT EXISTS network_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS network_status TEXT,
  ADD COLUMN IF NOT EXISTS network_sale_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS customer_country TEXT,
  ADD COLUMN IF NOT EXISTS items_count INTEGER;

-- Add index for the normalized network transaction ID
CREATE INDEX IF NOT EXISTS idx_commissions_network_txn 
  ON commissions(network, network_transaction_id) 
  WHERE network_transaction_id IS NOT NULL;

-- Add comment documenting raw_data encryption requirement
COMMENT ON COLUMN commissions.raw_data IS 
  'ENCRYPTION REQUIRED: Raw affiliate report data. Must be encrypted at application layer before storage. ';

-- ═══════════════════════════════════════════════════════════════════════════
-- A27-004: Partial indexes for soft-delete filtered queries
-- ═══════════════════════════════════════════════════════════════════════════

-- Partial index: active products only (most common public query pattern)
CREATE INDEX IF NOT EXISTS idx_products_active_site 
  ON products(site_id, created_at DESC) 
  WHERE status = 'active';

-- Partial index: non-archived products (admin default view)
CREATE INDEX IF NOT EXISTS idx_products_non_archived 
  ON products(site_id, updated_at DESC) 
  WHERE status != 'archived';

-- Partial index: active content (public queries)
CREATE INDEX IF NOT EXISTS idx_content_active_site 
  ON content(site_id, publish_at DESC) 
  WHERE status IN ('published', 'scheduled');

-- Partial index: active sites only
CREATE INDEX IF NOT EXISTS idx_sites_active 
  ON sites(created_at DESC) 
  WHERE is_active = true;

-- Partial index: active deals (not expired)
CREATE INDEX IF NOT EXISTS idx_products_active_deals 
  ON products(site_id, deal_expires_at) 
  WHERE status = 'active' AND deal_text IS NOT NULL AND deal_text != '';

-- ═══════════════════════════════════════════════════════════════════════════
-- A28-003, A28-004: Use explicit UTC for date buckets and scheduling
-- ═══════════════════════════════════════════════════════════════════════════

-- Replace CURRENT_DATE with explicit UTC date bucket in impression function
CREATE OR REPLACE FUNCTION record_ad_impression(
  p_site_id uuid,
  p_ad_placement_id uuid,
  p_content_id uuid,
  p_page_path text,
  p_cpm_revenue_cents bigint  -- A29-004: changed from integer to bigint
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.ad_impressions (
    site_id,
    ad_placement_id,
    content_id,
    page_path,
    impression_date,
    impression_count,
    cpm_revenue_cents,
    last_seen_at
  )
  VALUES (
    p_site_id,
    p_ad_placement_id,
    p_content_id,
    p_page_path,
    (NOW() AT TIME ZONE 'UTC')::DATE,  -- A28-004: explicit UTC date bucket
    1,
    p_cpm_revenue_cents,
    NOW()
  )
  ON CONFLICT (
    site_id,
    ad_placement_id,
    COALESCE(content_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(page_path, ''),
    impression_date
  )
  DO UPDATE SET
    impression_count = ad_impressions.impression_count + 1,
    cpm_revenue_cents = ad_impressions.cpm_revenue_cents + EXCLUDED.cpm_revenue_cents,
    last_seen_at = NOW();
END;
$$;

-- Grant execute permission to authenticated and service roles
GRANT EXECUTE ON FUNCTION record_ad_impression(uuid, uuid, uuid, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION record_ad_impression(uuid, uuid, uuid, text, bigint) TO service_role;

-- Add comment documenting UTC handling
COMMENT ON FUNCTION record_ad_impression IS 
  'Atomically records an ad impression. Uses explicit UTC date for impression_date to avoid timezone boundary issues.';

-- ═══════════════════════════════════════════════════════════════════════════
-- A29-004: Fix integer overflow for cpm_revenue_cents
-- ═══════════════════════════════════════════════════════════════════════════

-- Alter cpm_revenue_cents from integer to bigint to prevent overflow
ALTER TABLE ad_impressions 
  ALTER COLUMN cpm_revenue_cents TYPE BIGINT 
  USING cpm_revenue_cents::BIGINT;

-- Update RPC function signature was already changed above

-- Add CHECK constraint to ensure cpm_revenue_cents is non-negative
ALTER TABLE ad_impressions
  ADD CONSTRAINT chk_cpm_revenue_non_negative 
  CHECK (cpm_revenue_cents >= 0)
  NOT VALID;

-- ═══════════════════════════════════════════════════════════════════════════
-- A29-001: Enhanced money precision — add precision constraints
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure price_amount uses NUMERIC(12,2) for consistent precision
ALTER TABLE products 
  ALTER COLUMN price_amount TYPE NUMERIC(12,2) 
  USING price_amount::NUMERIC(12,2);

-- Add CHECK constraint for price_currency (ISO 4217 validation at DB level)
ALTER TABLE products
  ADD CONSTRAINT chk_price_currency_iso 
  CHECK (price_currency IS NULL OR price_currency ~ '^[A-Z]{3}$')
  NOT VALID;

-- Add precision constraints to commissions table
ALTER TABLE commissions
  ALTER COLUMN commission_amount TYPE NUMERIC(12,2) 
  USING commission_amount::NUMERIC(12,2),
  ALTER COLUMN sale_amount TYPE NUMERIC(12,2) 
  USING sale_amount::NUMERIC(12,2);

-- Add precision constraints to product_epc_stats
ALTER TABLE product_epc_stats
  ALTER COLUMN commissions_30d TYPE NUMERIC(12,2) 
  USING commissions_30d::NUMERIC(12,2),
  ALTER COLUMN commissions_7d TYPE NUMERIC(12,2) 
  USING commissions_7d::NUMERIC(12,2);

-- ═══════════════════════════════════════════════════════════════════════════
-- A30-004: Add tenant-scoped sequence/hash for hotspot mitigation
-- ═══════════════════════════════════════════════════════════════════════════

-- Add a hash column for distributing write load on high-traffic tenants
-- This is a preparatory step for future hash-based partitioning
ALTER TABLE ad_impressions
  ADD COLUMN IF NOT EXISTS site_hash SMALLINT 
  GENERATED ALWAYS AS (
    -- Simple hash: last 2 bits of site_id UUID for 4-way split
    (('x' || substr(site_id::text, 15, 4))::bit(16)::int) & 3
  ) STORED;

-- Create index on the hash column for potential future partitioning
CREATE INDEX IF NOT EXISTS idx_ad_impressions_site_hash 
  ON ad_impressions(site_hash, impression_date);

-- Add comment documenting the hash column purpose
COMMENT ON COLUMN ad_impressions.site_hash IS 
  'Sharding hash for distributing high-traffic tenant writes. Derived from site_id for 4-way split.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Documentation comments for soft-delete semantics
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE sites IS 
  'Sites table. Soft-delete via is_active=false. Hard delete restricted to super_admin only.';

COMMENT ON TABLE products IS 
  'Products table. Status: draft, active, archived. Soft-delete via status=archived. Historical clicks remain for analytics.';

COMMENT ON TABLE affiliate_clicks IS 
  'Click audit log with intentional denormalization. Stores product_name and affiliate_url as snapshots for historical reporting. These fields are NOT updated when products change — this is by design for analytics integrity.';

COMMENT ON TABLE commissions IS 
  'Commission reports. raw_data contains encrypted original network report data. Core fields are normalized to typed columns.';

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
