-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 2026071101: admin_api_tokens table
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Allows super admins to generate long-lived access tokens that can be
-- exchanged for an admin session without sharing a password. Used by
-- Devin / external automation tools.
--
-- Access is gated by the admin-api-tokens DAL and the token-login route.
--
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_api_tokens (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id      uuid                     REFERENCES public.sites(id) ON DELETE SET NULL,
  token_hash   text        NOT NULL UNIQUE,
  name         text        NOT NULL,
  created_by   uuid        NOT NULL REFERENCES public.admin_users(id) ON DELETE CASCADE,
  last_used_at timestamptz,
  expires_at   timestamptz NOT NULL,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_api_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_api_tokens_service_all" ON public.admin_api_tokens;
CREATE POLICY "admin_api_tokens_service_all" ON public.admin_api_tokens
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

REVOKE ALL ON public.admin_api_tokens FROM anon;

CREATE INDEX IF NOT EXISTS idx_admin_api_tokens_created_by ON public.admin_api_tokens(created_by);
CREATE INDEX IF NOT EXISTS idx_admin_api_tokens_token_hash ON public.admin_api_tokens(token_hash);
