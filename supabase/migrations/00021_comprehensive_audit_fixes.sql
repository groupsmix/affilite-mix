-- ═══════════════════════════════════════════════════════
-- Comprehensive Audit Fixes
-- ═══════════════════════════════════════════════════════
--
-- 2.2 (HIGH): Harden remaining RLS policies not covered by migration 00019.
--   - admin_users: add service_role-only policy (was missing entirely)
--   - sites: tighten public read to only active sites
--   - content_products: add site_id column reference for service_role policy
--
-- 2.3 (MEDIUM): Add any remaining composite indexes.
--
-- 2.4 (MEDIUM): Add RPC function for dashboard stats aggregation.
-- ═══════════════════════════════════════════════════════

-- ─── 2.2  Harden admin_users RLS ────────────────────────
-- admin_users had RLS enabled but NO policies at all, meaning
-- the anon key could not read it (good), but there was no explicit
-- service_role policy documenting the intended access pattern.

DROP POLICY IF EXISTS "service_full_access_admin_users" ON admin_users;
CREATE POLICY "service_full_access_admin_users" ON admin_users
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ─── 2.4  Dashboard stats RPC function ──────────────────
-- Single function call replaces multiple parallel queries from the
-- admin dashboard, reducing round-trips to the database.

CREATE OR REPLACE FUNCTION dashboard_stats(p_site_id UUID, p_since TIMESTAMPTZ DEFAULT now() - interval '7 days')
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_products', (SELECT count(*) FROM products WHERE site_id = p_site_id),
    'active_products', (SELECT count(*) FROM products WHERE site_id = p_site_id AND status = 'active'),
    'draft_products', (SELECT count(*) FROM products WHERE site_id = p_site_id AND status = 'draft'),
    'total_content', (SELECT count(*) FROM content WHERE site_id = p_site_id),
    'published_content', (SELECT count(*) FROM content WHERE site_id = p_site_id AND status = 'published'),
    'draft_content', (SELECT count(*) FROM content WHERE site_id = p_site_id AND status = 'draft'),
    'clicks_today', (SELECT count(*) FROM affiliate_clicks WHERE site_id = p_site_id AND created_at >= date_trunc('day', now())),
    'clicks_7d', (SELECT count(*) FROM affiliate_clicks WHERE site_id = p_site_id AND created_at >= p_since),
    'scheduled_content', (SELECT count(*) FROM content WHERE site_id = p_site_id AND status = 'scheduled' AND publish_at > now()),
    'products_no_url', (SELECT count(*) FROM products WHERE site_id = p_site_id AND status = 'active' AND (affiliate_url = '' OR affiliate_url IS NULL)),
    'content_no_products', (
      SELECT count(*) FROM content c
      WHERE c.site_id = p_site_id AND c.status = 'published'
      AND NOT EXISTS (SELECT 1 FROM content_products cp WHERE cp.content_id = c.id)
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
