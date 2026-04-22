-- ═══════════════════════════════════════════════════════════════════════════
-- ATOMIC IMPRESSION TRACKING FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════
-- This migration adds a PostgreSQL function for atomic impression tracking.
-- The function uses INSERT ... ON CONFLICT ... DO UPDATE to safely increment
-- impression counts under high concurrency without race conditions.
--
-- This is a defense-in-depth improvement over the application-level upsert
-- because it guarantees atomicity at the database level.
-- ═══════════════════════════════════════════════════════════════════════════

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
    CURRENT_DATE,
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
GRANT EXECUTE ON FUNCTION record_ad_impression(uuid, uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION record_ad_impression(uuid, uuid, uuid, text, integer) TO service_role;

-- Add comment for documentation
COMMENT ON FUNCTION record_ad_impression IS 
  'Atomically records an ad impression. Increments count if an impression already exists for the same site/placement/content/page/date combination. Safe under high concurrency.';
