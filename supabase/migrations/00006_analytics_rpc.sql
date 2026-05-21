-- Migration: Add Postgres RPC functions for analytics aggregation
-- These replace the JS-side aggregation that fetches all rows into memory.

-- Top products by click count
CREATE OR REPLACE FUNCTION get_top_products(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(product_name text, click_count bigint) AS $$
  SELECT product_name, count(*) as click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since
  GROUP BY product_name
  ORDER BY click_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- Top referrers by click count
CREATE OR REPLACE FUNCTION get_top_referrers(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(referrer text, click_count bigint) AS $$
  SELECT COALESCE(NULLIF(referrer, ''), '(direct)') as referrer, count(*) as click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since
  GROUP BY COALESCE(NULLIF(referrer, ''), '(direct)')
  ORDER BY click_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- Top content slugs driving clicks
CREATE OR REPLACE FUNCTION get_top_content_slugs(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(content_slug text, click_count bigint) AS $$
  SELECT content_slug, count(*) as click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND content_slug <> ''
  GROUP BY content_slug
  ORDER BY click_count DESC
  LIMIT p_limit;
$$ LANGUAGE sql STABLE;

-- Daily click counts for chart data
CREATE OR REPLACE FUNCTION get_daily_clicks(p_site_id uuid, p_since timestamptz)
RETURNS TABLE(date text, count bigint) AS $$
  SELECT to_char(created_at::date, 'YYYY-MM-DD') as date, count(*) as count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since
  GROUP BY created_at::date
  ORDER BY created_at::date ASC;
$$ LANGUAGE sql STABLE;
