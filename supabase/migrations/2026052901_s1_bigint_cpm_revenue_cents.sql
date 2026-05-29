-- ============================================================
-- Migration 2026052901: S1-A10-02 / S1-A29-02 — widen cpm_revenue_cents
--
-- The INT4 accumulator in ad_impressions can overflow at ~$21M/row/day.
-- Widen to BIGINT to prevent wrap/error under extreme volume.
-- Also recreate record_ad_impression() with the new parameter type.
-- ============================================================

-- Step 1: widen the column
ALTER TABLE public.ad_impressions
  ALTER COLUMN cpm_revenue_cents SET DATA TYPE bigint;

-- Step 2: replace the function with a bigint parameter
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_site_id uuid,
  p_ad_placement_id uuid,
  p_content_id uuid,
  p_page_path text,
  p_cpm_revenue_cents bigint
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public
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

-- Drop the old integer-param overload if it exists
DROP FUNCTION IF EXISTS public.record_ad_impression(uuid, uuid, uuid, text, integer);

-- Grants: restrict to service_role only (S1-A16-02 / S1-A25-01)
REVOKE ALL ON FUNCTION public.record_ad_impression(uuid, uuid, uuid, text, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_ad_impression(uuid, uuid, uuid, text, bigint) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, uuid, uuid, text, bigint) TO service_role;

COMMENT ON FUNCTION public.record_ad_impression IS
  'Atomically records an ad impression. Increments count if an impression '
  'already exists for the same site/placement/content/page/date combination. '
  'S1-A10-02: parameter widened to bigint. S1-A25-01: restricted to service_role.';
