-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026071401: tenant-isolation RLS for the media library
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Bug: dashboard uploads finalized successfully (file promoted to the public
-- R2 bucket, finalize returned {ok:true}) but never appeared in the Media
-- Library grid, and /api/admin/media returned zero rows.
--
-- Root cause: the `media` table (migration 2026071201) was created AFTER the
-- blanket tenant-isolation migration 00064 had already run, so it only ever
-- received the `media_service_all` policy (service_role only). Every other
-- per-site table (products, content, categories, …) carries a
-- `tenant_isolation_auth_*` policy, and their DAL helpers use the
-- request-scoped authenticated (tenant) client. The media DAL uses the same
-- tenant client — but with no authenticated policy on `media`, RLS silently
-- denied every INSERT (from /api/admin/upload/finalize) and every SELECT
-- (Media page + /api/admin/media).
--
-- Fix: grant the authenticated role table privileges on `media` and add the
-- standard tenant-isolation policy, matching the current products/content form
-- (migration 00092: `site_id = ANY(public.current_request_site_ids())`). This
-- keeps RLS as defence-in-depth and does not add a new service-role import
-- site (media stays on the RLS-enforced tenant client, like products).
-- ═══════════════════════════════════════════════════════════════════════════

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media TO authenticated;

DROP POLICY IF EXISTS tenant_isolation_auth_media ON public.media;
CREATE POLICY tenant_isolation_auth_media ON public.media
  FOR ALL
  TO authenticated
  USING (site_id = ANY (public.current_request_site_ids()))
  WITH CHECK (site_id = ANY (public.current_request_site_ids()));
