-- Down migration for 2026052901

-- Restore the integer-param function
CREATE OR REPLACE FUNCTION public.record_ad_impression(
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

-- Drop the bigint overload
DROP FUNCTION IF EXISTS public.record_ad_impression(uuid, uuid, uuid, text, bigint);

-- Restore grants to authenticated + service_role
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, uuid, uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, uuid, uuid, text, integer) TO service_role;

-- Narrow the column back
ALTER TABLE public.ad_impressions
  ALTER COLUMN cpm_revenue_cents SET DATA TYPE integer;
