-- Run analytics aggregation in Postgres for bounded dashboard date ranges.
--
-- The three-argument functions remain available as compatibility wrappers.
-- The four-argument functions are the single aggregation implementation used
-- by both the unbounded and custom-range DAL paths.

CREATE OR REPLACE FUNCTION public.get_top_products(
  p_site_id uuid,
  p_since timestamptz,
  p_limit int,
  p_until timestamptz
)
RETURNS TABLE(product_name text, click_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(product_name, '') AS product_name, count(*) AS click_count
  FROM public.affiliate_clicks
  WHERE site_id = p_site_id
    AND created_at >= p_since
    AND (p_until IS NULL OR created_at <= p_until)
    AND is_internal = FALSE
  GROUP BY COALESCE(product_name, '')
  ORDER BY click_count DESC, product_name ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_top_products(
  p_site_id uuid,
  p_since timestamptz,
  p_limit int
)
RETURNS TABLE(product_name text, click_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.get_top_products(p_site_id, p_since, p_limit, NULL);
$$;

CREATE OR REPLACE FUNCTION public.get_top_referrers(
  p_site_id uuid,
  p_since timestamptz,
  p_limit int,
  p_until timestamptz
)
RETURNS TABLE(referrer text, click_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, count(*) AS click_count
  FROM public.affiliate_clicks
  WHERE site_id = p_site_id
    AND created_at >= p_since
    AND (p_until IS NULL OR created_at <= p_until)
    AND is_internal = FALSE
  GROUP BY COALESCE(NULLIF(referrer, ''), '(direct)')
  ORDER BY click_count DESC, referrer ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_top_referrers(
  p_site_id uuid,
  p_since timestamptz,
  p_limit int
)
RETURNS TABLE(referrer text, click_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.get_top_referrers(p_site_id, p_since, p_limit, NULL);
$$;

CREATE OR REPLACE FUNCTION public.get_top_content_slugs(
  p_site_id uuid,
  p_since timestamptz,
  p_limit int,
  p_until timestamptz
)
RETURNS TABLE(content_slug text, click_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT content_slug, count(*) AS click_count
  FROM public.affiliate_clicks
  WHERE site_id = p_site_id
    AND created_at >= p_since
    AND (p_until IS NULL OR created_at <= p_until)
    AND content_slug <> ''
    AND is_internal = FALSE
  GROUP BY content_slug
  ORDER BY click_count DESC, content_slug ASC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_top_content_slugs(
  p_site_id uuid,
  p_since timestamptz,
  p_limit int
)
RETURNS TABLE(content_slug text, click_count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.get_top_content_slugs(p_site_id, p_since, p_limit, NULL);
$$;

CREATE OR REPLACE FUNCTION public.get_daily_clicks(
  p_site_id uuid,
  p_since timestamptz,
  p_until timestamptz
)
RETURNS TABLE(date text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(created_at::date, 'YYYY-MM-DD') AS date, count(*) AS count
  FROM public.affiliate_clicks
  WHERE site_id = p_site_id
    AND created_at >= p_since
    AND (p_until IS NULL OR created_at <= p_until)
    AND is_internal = FALSE
  GROUP BY created_at::date
  ORDER BY created_at::date ASC;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_clicks(
  p_site_id uuid,
  p_since timestamptz
)
RETURNS TABLE(date text, count bigint)
LANGUAGE sql
STABLE
AS $$
  SELECT * FROM public.get_daily_clicks(p_site_id, p_since, NULL);
$$;
