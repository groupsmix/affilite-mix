-- A158: Affiliate self-referral prevention.
--
-- Adds an is_internal flag to affiliate_clicks to distinguish between
-- legitimate visitor traffic and internal testing or self-referral
-- clicks by administrators.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliate_clicks'
      AND column_name = 'is_internal'
  ) THEN
    ALTER TABLE public.affiliate_clicks
      ADD COLUMN is_internal BOOLEAN DEFAULT FALSE;
    
    COMMENT ON COLUMN public.affiliate_clicks.is_internal IS
      'A158: True if the click was identified as internal (e.g. from a logged-in admin).';
  END IF;
END $$;

-- Redefine top products by click count to ignore internal clicks
CREATE OR REPLACE FUNCTION get_top_products(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(product_name text, click_count bigint) AS $$
  SELECT product_name, count(*) as click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND is_internal = FALSE
  GROUP BY product_name
  ORDER BY click_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- Redefine top referrers by click count to ignore internal clicks
CREATE OR REPLACE FUNCTION get_top_referrers(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(referrer text, click_count bigint) AS $$
  SELECT COALESCE(NULLIF(referrer, ''), '(direct)') as referrer, count(*) as click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND is_internal = FALSE
  GROUP BY COALESCE(NULLIF(referrer, ''), '(direct)')
  ORDER BY click_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- Redefine top content slugs driving clicks to ignore internal clicks
CREATE OR REPLACE FUNCTION get_top_content_slugs(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(content_slug text, click_count bigint) AS $$
  SELECT content_slug, count(*) as click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND content_slug <> '' AND is_internal = FALSE
  GROUP BY content_slug
  ORDER BY click_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- Redefine daily click counts for chart data to ignore internal clicks
CREATE OR REPLACE FUNCTION get_daily_clicks(p_site_id uuid, p_since timestamptz)
RETURNS TABLE(date text, count bigint) AS $$
  SELECT to_char(created_at::date, 'YYYY-MM-DD') as date, count(*) as count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND is_internal = FALSE
  GROUP BY created_at::date
  ORDER BY created_at::date ASC;
$$ LANGUAGE sql STABLE;
