-- Migration: Add RPC function for niche health dashboard aggregation.
-- Replaces the N+1 query pattern where each site triggers 6+ individual queries.

CREATE OR REPLACE FUNCTION get_niche_health_stats(p_seven_days_ago timestamptz, p_fourteen_days_ago timestamptz)
RETURNS TABLE(
  site_id uuid,
  total_products bigint,
  total_content bigint,
  clicks_7d bigint,
  clicks_prev_7d bigint,
  last_published_at timestamptz,
  subscriber_count bigint
) AS $$
  SELECT
    s.id AS site_id,
    COALESCE(p.cnt, 0) AS total_products,
    COALESCE(c.cnt, 0) AS total_content,
    COALESCE(cl7.cnt, 0) AS clicks_7d,
    COALESCE(cl14.cnt, 0) - COALESCE(cl7.cnt, 0) AS clicks_prev_7d,
    lp.last_published_at,
    COALESCE(ns.cnt, 0) AS subscriber_count
  FROM sites s
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM products WHERE products.site_id = s.id
  ) p ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM content WHERE content.site_id = s.id
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM affiliate_clicks
    WHERE affiliate_clicks.site_id = s.id AND affiliate_clicks.created_at >= p_seven_days_ago
  ) cl7 ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM affiliate_clicks
    WHERE affiliate_clicks.site_id = s.id AND affiliate_clicks.created_at >= p_fourteen_days_ago
  ) cl14 ON true
  LEFT JOIN LATERAL (
    SELECT max(content.updated_at) AS last_published_at FROM content
    WHERE content.site_id = s.id AND content.status = 'published'
  ) lp ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS cnt FROM newsletter_subscribers
    WHERE newsletter_subscribers.site_id = s.id
  ) ns ON true
  WHERE s.is_active = true;
$$ LANGUAGE sql STABLE;
