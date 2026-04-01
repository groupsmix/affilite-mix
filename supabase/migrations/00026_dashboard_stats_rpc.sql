-- RPC function to aggregate all admin dashboard statistics in a single DB call.
-- Replaces 15+ individual queries with one round-trip.
CREATE OR REPLACE FUNCTION get_dashboard_stats(
  p_site_id UUID,
  p_today_start TIMESTAMPTZ,
  p_seven_days_ago TIMESTAMPTZ
)
RETURNS JSON
LANGUAGE SQL
STABLE
AS $$
  SELECT json_build_object(
    'total_products',      (SELECT count(*) FROM products WHERE site_id = p_site_id),
    'active_products',     (SELECT count(*) FROM products WHERE site_id = p_site_id AND status = 'active'),
    'draft_products',      (SELECT count(*) FROM products WHERE site_id = p_site_id AND status = 'draft'),
    'total_content',       (SELECT count(*) FROM content  WHERE site_id = p_site_id),
    'published_content',   (SELECT count(*) FROM content  WHERE site_id = p_site_id AND status = 'published'),
    'draft_content',       (SELECT count(*) FROM content  WHERE site_id = p_site_id AND status = 'draft'),
    'clicks_today',        (SELECT count(*) FROM affiliate_clicks WHERE site_id = p_site_id AND created_at >= p_today_start),
    'clicks_7d',           (SELECT count(*) FROM affiliate_clicks WHERE site_id = p_site_id AND created_at >= p_seven_days_ago),
    'products_no_url',     (SELECT count(*) FROM products WHERE site_id = p_site_id AND status = 'active' AND (affiliate_url IS NULL OR affiliate_url = '')),
    'content_no_products', (
      SELECT count(*) FROM content c
      WHERE c.site_id = p_site_id
        AND c.status = 'published'
        AND NOT EXISTS (
          SELECT 1 FROM content_products cp
          WHERE cp.content_id = c.id AND cp.site_id = p_site_id
        )
    ),
    'scheduled_content',   (SELECT count(*) FROM content WHERE site_id = p_site_id AND status = 'scheduled' AND publish_at > NOW())
  );
$$;
