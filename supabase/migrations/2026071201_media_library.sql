-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026071201: media library table
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Centralized media registry so products, content, pages, and settings can
-- reuse uploads instead of each flow keeping its own isolated URLs.
--
-- Rows are inserted by /api/admin/upload/finalize after an upload passes
-- magic-byte validation and is promoted to the public R2 bucket.
--
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.media (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  public_key   text        NOT NULL,
  url          text        NOT NULL,
  filename     text,
  content_type text,
  size_bytes   int,
  alt_text     text,
  created_by   uuid                     REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "media_service_all" ON public.media;
CREATE POLICY "media_service_all" ON public.media
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

REVOKE ALL ON public.media FROM anon;

CREATE INDEX IF NOT EXISTS idx_media_site_id ON public.media(site_id);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON public.media(created_at);
