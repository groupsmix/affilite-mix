-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026071506: site presentations (DB-authoritative header/footer design)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Adds a dedicated presentation record so the dashboard (or the automation AI)
-- can change a site's header/footer design at runtime WITHOUT editing source
-- code or redeploying — while site identity/domain stays code-authoritative.
--
-- Authority split:
--   sites            — identity/domain (code-authoritative for config sites)
--   site_presentations — visual chrome (DB-authoritative), validated on read
--
-- Versioning / lifecycle per site:
--   draft      — the editable working copy (at most one per site)
--   published  — the live version (at most one per site)
--   archived   — previous published versions, kept for one-click rollback
--
-- Publishing and rollback are atomic RPCs (SECURITY DEFINER) so the live
-- version never flickers to an inconsistent state. All values in the JSONB
-- columns are re-validated by lib/presentation before they reach a component,
-- so a malformed/hostile row can only ever degrade to a safe default.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.site_presentations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id         uuid        NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  status          text        NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft', 'published', 'archived')),
  -- Monotonic per site; assigned when a draft is published. NULL while draft.
  version         integer     CHECK (version IS NULL OR version > 0),
  header_variant  text,
  footer_variant  text,
  header_config   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  footer_config   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  header_tokens   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_by      uuid        REFERENCES public.admin_users(id) ON DELETE SET NULL,
  published_by    uuid        REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_site_presentations_site
  ON public.site_presentations(site_id);

-- At most one draft and one published row per site.
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_presentations_one_draft
  ON public.site_presentations(site_id) WHERE status = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_presentations_one_published
  ON public.site_presentations(site_id) WHERE status = 'published';
-- Version is unique per site once assigned.
CREATE UNIQUE INDEX IF NOT EXISTS uq_site_presentations_version
  ON public.site_presentations(site_id, version) WHERE version IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.site_presentations ENABLE ROW LEVEL SECURITY;

-- Strip Supabase's default anon/authenticated grants, then re-grant only the
-- narrow SELECT the public layout needs (audit F7). RLS below still restricts
-- anon to published rows.
REVOKE ALL ON public.site_presentations FROM anon;
REVOKE ALL ON public.site_presentations FROM authenticated;
GRANT SELECT ON public.site_presentations TO anon;

-- Public/anon may read only the live (published) presentation — this is what
-- the public layout renders. Draft/archived rows are never anon-visible.
DROP POLICY IF EXISTS "site_presentations_public_read" ON public.site_presentations;
CREATE POLICY "site_presentations_public_read" ON public.site_presentations
  FOR SELECT TO anon USING (status = 'published');

-- All writes + draft/history reads go through the privileged (service_role)
-- client after the route layer has authenticated an admin session.
DROP POLICY IF EXISTS "site_presentations_service_all" ON public.site_presentations;
CREATE POLICY "site_presentations_service_all" ON public.site_presentations
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ── Atomic publish ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.publish_site_presentation(p_site_id uuid, p_actor uuid)
RETURNS public.site_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft        public.site_presentations;
  v_next_version integer;
  v_result       public.site_presentations;
BEGIN
  SELECT * INTO v_draft
    FROM public.site_presentations
   WHERE site_id = p_site_id AND status = 'draft'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no draft presentation to publish for site %', p_site_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Demote the current live version to history.
  UPDATE public.site_presentations
     SET status = 'archived', updated_at = now()
   WHERE site_id = p_site_id AND status = 'published';

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.site_presentations WHERE site_id = p_site_id;

  UPDATE public.site_presentations
     SET status = 'published',
         version = v_next_version,
         published_at = now(),
         published_by = p_actor,
         updated_at = now()
   WHERE id = v_draft.id
   RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

-- ── Atomic rollback (one-click) ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.rollback_site_presentation(p_site_id uuid, p_actor uuid)
RETURNS public.site_presentations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prev         public.site_presentations;
  v_next_version integer;
  v_result       public.site_presentations;
BEGIN
  -- Most recent archived version becomes live again.
  SELECT * INTO v_prev
    FROM public.site_presentations
   WHERE site_id = p_site_id AND status = 'archived'
   ORDER BY version DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no previous presentation to roll back to for site %', p_site_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.site_presentations
     SET status = 'archived', updated_at = now()
   WHERE site_id = p_site_id AND status = 'published';

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_next_version
    FROM public.site_presentations WHERE site_id = p_site_id;

  UPDATE public.site_presentations
     SET status = 'published',
         version = v_next_version,
         published_at = now(),
         published_by = p_actor,
         updated_at = now()
   WHERE id = v_prev.id
   RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_site_presentation(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rollback_site_presentation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_site_presentation(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rollback_site_presentation(uuid, uuid) TO service_role;
