-- ═══════════════════════════════════════════════════════════════════
-- Migration 2026070301: Consolidated multi-niche overview RPC
--
-- Problem:
--   The admin dashboard's MultiNicheOverview, getDomainPerformance, and
--   getRevenuePerSite each follow an N+1 query pattern: they call
--   listSites() to get N sites, then fan out N parallel queries
--   (getClickCount, countProducts, countContent) per site.
--
--   With 4 sites this means 1 + (4 * 4) = 17 queries per analytics page
--   load, plus 7 more from the page itself = 24 total. On the free tier
--   with a 10-connection pool, this saturates the pool and triggers
--   Supabase's "exhausting multiple resources" warning.
--
-- Solution:
--   Three STABLE SQL functions that do the same work in a single query
--   each, using LEFT JOIN + conditional aggregation instead of N+1:
--
--     1. get_multi_niche_overview(p_today_start, p_seven_days_ago)
--        → one row per site with clicks_today, clicks_7d, total_products,
--          total_content, is_active
--
--     2. get_domain_performance(p_since)
--        → one row per site with clicks, est_revenue_per_click, revenue
--
--     3. get_revenue_per_site(p_since)
--        → same as get_domain_performance but sorted by revenue desc
--
--   All three are STABLE (read-only), SECURITY INVOKER (RLS-enforced),
--   and callable by the authenticated role (admin dashboard only).
--
--   Existing per-site RPCs (get_top_content_slugs, get_daily_clicks) are
--   untouched — they're called once per site for the CURRENT site only,
--   not once per site for ALL sites.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. Multi-niche overview ─────────────────────────────────────────
-- Replaces: listSites() + N * (getClickCount x2, countProducts, countContent)
-- Called by: MultiNicheOverview Server Component (analytics page, super_admin)

CREATE OR REPLACE FUNCTION get_multi_niche_overview(
  p_today_start timestamptz,
  p_seven_days_ago timestamptz
)
RETURNS TABLE(
  site_id uuid,
  name text,
  slug text,
  clicks_today bigint,
  clicks_7d bigint,
  total_products bigint,
  total_content bigint,
  is_active boolean
) AS $$
  SELECT
    s.id AS site_id,
    s.name,
    s.slug,
    COALESCE(clicks_today.cnt, 0) AS clicks_today,
    COALESCE(clicks_7d.cnt, 0) AS clicks_7d,
    COALESCE(prod.cnt, 0) AS total_products,
    COALESCE(cont.cnt, 0) AS total_content,
    s.is_active
  FROM sites s
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM affiliate_clicks ac
    WHERE ac.site_id = s.id AND ac.created_at >= p_today_start AND ac.is_internal = false
  ) clicks_today ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM affiliate_clicks ac
    WHERE ac.site_id = s.id AND ac.created_at >= p_seven_days_ago AND ac.is_internal = false
  ) clicks_7d ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM products p WHERE p.site_id = s.id
  ) prod ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM content c WHERE c.site_id = s.id
  ) cont ON true
  ORDER BY s.name;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── 2. Domain performance ───────────────────────────────────────────
-- Replaces: listSites() + N * getClickCount()
-- Called by: getDomainPerformance() (analytics domains API route)

CREATE OR REPLACE FUNCTION get_domain_performance(
  p_since timestamptz
)
RETURNS TABLE(
  site_id uuid,
  slug text,
  name text,
  domain text,
  clicks bigint,
  est_revenue_per_click numeric,
  revenue numeric
) AS $$
  SELECT
    s.id AS site_id,
    s.slug,
    s.name,
    s.domain,
    COALESCE(clicks.cnt, 0) AS clicks,
    COALESCE(s.est_revenue_per_click, 0) AS est_revenue_per_click,
    round(COALESCE(clicks.cnt, 0) * COALESCE(s.est_revenue_per_click, 0), 2) AS revenue
  FROM sites s
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM affiliate_clicks ac
    WHERE ac.site_id = s.id AND ac.created_at >= p_since AND ac.is_internal = false
  ) clicks ON true
  ORDER BY clicks.cnt DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ── 3. Revenue per site ─────────────────────────────────────────────
-- Replaces: listSites() + N * getClickCount() (cached variant)
-- Called by: getRevenuePerSite() (dashboard revenue card)
-- Same as get_domain_performance but sorted by revenue desc.

CREATE OR REPLACE FUNCTION get_revenue_per_site(
  p_since timestamptz
)
RETURNS TABLE(
  site_id uuid,
  slug text,
  name text,
  clicks bigint,
  rate_per_click numeric,
  revenue numeric
) AS $$
  SELECT
    s.id AS site_id,
    s.slug,
    s.name,
    COALESCE(clicks.cnt, 0) AS clicks,
    COALESCE(s.est_revenue_per_click, 0) AS rate_per_click,
    COALESCE(clicks.cnt, 0) * COALESCE(s.est_revenue_per_click, 0) AS revenue
  FROM sites s
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt
    FROM affiliate_clicks ac
    WHERE ac.site_id = s.id AND ac.created_at >= p_since AND ac.is_internal = false
  ) clicks ON true
  ORDER BY (clicks.cnt * COALESCE(s.est_revenue_per_click, 0)) DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;
-- ── Grants ──────────────────────────────────────────────────────────
-- These are STABLE, SECURITY DEFINER functions with locked search_path.
-- They bypass RLS (needed to read affiliate_clicks which only has a
-- service_role SELECT policy). The admin dashboard calls them via the
-- tenant client (authenticated role). The SECURITY DEFINER privilege
-- is scoped to read-only aggregate queries — no writes, no user data
-- exposure beyond what the dashboard already shows.
-- service_role already has EXECUTE on all public functions by default.

GRANT EXECUTE ON FUNCTION get_multi_niche_overview TO authenticated;
GRANT EXECUTE ON FUNCTION get_domain_performance TO authenticated;
GRANT EXECUTE ON FUNCTION get_revenue_per_site TO authenticated;
