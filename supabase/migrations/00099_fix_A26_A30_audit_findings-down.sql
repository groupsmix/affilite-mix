-- ============================================================================
-- Down Migration 00099: Rollback A26-A30 audit fixes
-- ============================================================================

-- Drop A30-04 site_hash
DROP INDEX IF EXISTS idx_ad_impressions_site_hash;
ALTER TABLE ad_impressions DROP COLUMN IF EXISTS site_hash;

-- Drop A29-04 bigint change (revert to integer - DATA LOSS WARNING)
-- WARNING: Values > 2^31-1 will be truncated. Verify data before rollback.
ALTER TABLE ad_impressions DROP CONSTRAINT IF EXISTS chk_cpm_revenue_non_negative;
-- ALTER TABLE ad_impressions ALTER COLUMN cpm_revenue_cents TYPE INTEGER; -- INTENTIONALLY COMMENTED OUT for safety

-- Drop A29-01 precision constraints
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_price_currency_iso;
ALTER TABLE products ALTER COLUMN price_amount TYPE NUMERIC; -- widen

ALTER TABLE commissions ALTER COLUMN commission_amount TYPE NUMERIC;
ALTER TABLE commissions ALTER COLUMN sale_amount TYPE NUMERIC;

ALTER TABLE product_epc_stats ALTER COLUMN commissions_30d TYPE NUMERIC;
ALTER TABLE product_epc_stats ALTER COLUMN commissions_7d TYPE NUMERIC;

-- Drop A27-04 partial indexes
DROP INDEX IF EXISTS idx_products_active_site;
DROP INDEX IF EXISTS idx_products_non_archived;
DROP INDEX IF EXISTS idx_content_active_site;
DROP INDEX IF EXISTS idx_sites_active;
DROP INDEX IF EXISTS idx_products_active_deals;

-- Drop A28-04 UTC impression function (restore original with integer)
DROP FUNCTION IF EXISTS record_ad_impression(uuid, uuid, uuid, text, bigint);

CREATE OR REPLACE FUNCTION record_ad_impression(
  p_site_id uuid,
  p_ad_placement_id uuid,
  p_content_id uuid,
  p_page_path text,
  p_cpm_revenue_cents integer
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.ad_impressions (
    site_id, ad_placement_id, content_id, page_path,
    impression_date, impression_count, cpm_revenue_cents, last_seen_at
  )
  VALUES (
    p_site_id, p_ad_placement_id, p_content_id, p_page_path,
    CURRENT_DATE, 1, p_cpm_revenue_cents, NOW()
  )
  ON CONFLICT (
    site_id, ad_placement_id,
    COALESCE(content_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(page_path, ''), impression_date
  )
  DO UPDATE SET
    impression_count = ad_impressions.impression_count + 1,
    cpm_revenue_cents = ad_impressions.cpm_revenue_cents + EXCLUDED.cpm_revenue_cents,
    last_seen_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION record_ad_impression(uuid, uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION record_ad_impression(uuid, uuid, uuid, text, integer) TO service_role;

-- Drop A26-03 normalized commission columns
DROP INDEX IF EXISTS idx_commissions_network_txn;
ALTER TABLE commissions 
  DROP COLUMN IF EXISTS network_transaction_id,
  DROP COLUMN IF EXISTS network_status,
  DROP COLUMN IF EXISTS network_sale_amount,
  DROP COLUMN IF EXISTS customer_country,
  DROP COLUMN IF EXISTS items_count;

-- Drop db_now RPC
DROP FUNCTION IF EXISTS db_now();

-- Drop A26-01 price sync trigger and constraints
DROP TRIGGER IF EXISTS products_sync_price ON products;
DROP FUNCTION IF EXISTS sync_price_display();
DROP FUNCTION IF EXISTS generate_price_display(NUMERIC, TEXT);
ALTER TABLE products DROP CONSTRAINT IF EXISTS chk_price_amount_scale;

-- Restore comments to original state (clear them)
COMMENT ON TABLE sites IS NULL;
COMMENT ON TABLE products IS NULL;
COMMENT ON TABLE affiliate_clicks IS NULL;
COMMENT ON TABLE commissions IS NULL;
