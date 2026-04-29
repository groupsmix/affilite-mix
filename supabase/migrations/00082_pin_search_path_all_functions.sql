-- DB-02: Pin search_path on every existing function that lacks it.
--
-- Defense-in-depth per Supabase Linter best practice and CVE-2018-1058.
-- Functions already pinned (by prior migrations 00057, 00060, 00067,
-- 00070, 00073, 00081) are excluded.

-- 00000_baseline_repair: update_updated_at()
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 00006_analytics_rpc: get_top_products
CREATE OR REPLACE FUNCTION public.get_top_products(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(product_name text, click_count bigint)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT product_name, count(*) AS click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since
  GROUP BY product_name
  ORDER BY click_count DESC
  LIMIT p_limit;
$$;

-- 00006_analytics_rpc: get_top_referrers
CREATE OR REPLACE FUNCTION public.get_top_referrers(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(referrer text, click_count bigint)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT referrer, count(*) AS click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND referrer IS NOT NULL AND referrer <> ''
  GROUP BY referrer
  ORDER BY click_count DESC
  LIMIT p_limit;
$$;

-- 00006_analytics_rpc: get_top_content_slugs
CREATE OR REPLACE FUNCTION public.get_top_content_slugs(p_site_id uuid, p_since timestamptz, p_limit int)
RETURNS TABLE(content_slug text, click_count bigint)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT content_slug, count(*) AS click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since AND content_slug IS NOT NULL AND content_slug <> ''
  GROUP BY content_slug
  ORDER BY click_count DESC
  LIMIT p_limit;
$$;

-- 00006_analytics_rpc: get_daily_clicks
CREATE OR REPLACE FUNCTION public.get_daily_clicks(p_site_id uuid, p_since timestamptz)
RETURNS TABLE(day date, click_count bigint)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT created_at::date AS day, count(*) AS click_count
  FROM affiliate_clicks
  WHERE site_id = p_site_id AND created_at >= p_since
  GROUP BY day
  ORDER BY day;
$$;

-- 00013_comprehensive_sites_schema: update_sites_updated_at()
CREATE OR REPLACE FUNCTION public.update_sites_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 00028_platform_modules_permissions_integrations: update_generic_updated_at()
CREATE OR REPLACE FUNCTION public.update_generic_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 00029_ai_drafts_and_affiliate_networks: update_updated_at_column()
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 00022_niche_health_rpc: get_niche_health_stats
-- This function queries across sites so we re-create with search_path pinned.
CREATE OR REPLACE FUNCTION public.get_niche_health_stats(
  p_seven_days_ago timestamptz,
  p_fourteen_days_ago timestamptz
)
RETURNS TABLE(
  site_id uuid,
  total_products bigint,
  total_content bigint,
  total_clicks_7d bigint,
  total_clicks_14d bigint
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    s.id AS site_id,
    (SELECT count(*) FROM products p WHERE p.site_id = s.id) AS total_products,
    (SELECT count(*) FROM content c WHERE c.site_id = s.id) AS total_content,
    (SELECT count(*) FROM affiliate_clicks ac WHERE ac.site_id = s.id AND ac.created_at >= p_seven_days_ago) AS total_clicks_7d,
    (SELECT count(*) FROM affiliate_clicks ac WHERE ac.site_id = s.id AND ac.created_at >= p_fourteen_days_ago) AS total_clicks_14d
  FROM sites s;
$$;

-- 00042_atomic_impression_function: record_ad_impression
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_site_id uuid,
  p_ad_slot_id uuid,
  p_page_path text,
  p_user_agent text DEFAULT NULL,
  p_ip_hash text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO ad_impressions (site_id, ad_slot_id, page_path, user_agent, ip_hash)
  VALUES (p_site_id, p_ad_slot_id, p_page_path, p_user_agent, p_ip_hash)
  RETURNING id INTO v_id;

  -- Bump the total_impressions counter on the ad slot
  UPDATE ad_slots SET total_impressions = total_impressions + 1 WHERE id = p_ad_slot_id;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.record_ad_impression IS
  'DB-02: Atomic ad-impression recording with SET search_path pinning.';
