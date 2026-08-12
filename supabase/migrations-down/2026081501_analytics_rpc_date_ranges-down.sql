-- Restore the pre-2026081501 analytics RPC implementations and remove
-- the date-range overloads.

DROP FUNCTION IF EXISTS public.get_top_products(uuid, timestamptz, int, timestamptz);
DROP FUNCTION IF EXISTS public.get_top_referrers(uuid, timestamptz, int, timestamptz);
DROP FUNCTION IF EXISTS public.get_top_content_slugs(uuid, timestamptz, int, timestamptz);
DROP FUNCTION IF EXISTS public.get_daily_clicks(uuid, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_top_products(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(product_name text, click_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT product_name, count(*) AS click_count
  FROM public.affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND is_internal = FALSE
  GROUP BY product_name
  ORDER BY click_count DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_top_referrers(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(referrer text, click_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, count(*) AS click_count
  FROM public.affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND is_internal = FALSE
  GROUP BY COALESCE(NULLIF(referrer, ''), '(direct)')
  ORDER BY click_count DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_top_content_slugs(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(content_slug text, click_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT content_slug, count(*) AS click_count
  FROM public.affiliate_clicks
  WHERE site_id = p_site_id
    AND created_at >= p_since
    AND content_slug <> ''
    AND is_internal = FALSE
  GROUP BY content_slug
  ORDER BY click_count DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_clicks(p_site_id uuid, p_since timestamptz)
RETURNS TABLE(date text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(created_at::date, 'YYYY-MM-DD') AS date, count(*) AS count
  FROM public.affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND is_internal = FALSE
  GROUP BY created_at::date
  ORDER BY created_at::date ASC;
$$;
