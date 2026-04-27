-- Migration: affiliate_tracking_keys lookup table (A-02 / F-013)
-- Replaces provider-string site_id mapping in commission ingest with an
-- authoritative registry keyed by (network, tracking_key).

CREATE TABLE IF NOT EXISTS public.affiliate_tracking_keys (
  site_id UUID NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  network TEXT NOT NULL,
  tracking_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (network, tracking_key)
);

-- Index for fast site-centric lookups in the admin UI
CREATE INDEX IF NOT EXISTS idx_affiliate_tracking_keys_site_id
  ON public.affiliate_tracking_keys(site_id);

-- RLS: only service-role / authenticated users with matching site_id can read;
-- writes are service-role or admin-only.
ALTER TABLE public.affiliate_tracking_keys ENABLE ROW LEVEL SECURITY;

-- Allow tenant-scoped selects (admins viewing keys for their site)
CREATE POLICY tenant_select_affiliate_tracking_keys
  ON public.affiliate_tracking_keys
  FOR SELECT
  TO authenticated
  USING (site_id = (current_setting('request.jwt.claims', true)::json->>'site_id')::UUID);

-- Service-role bypass (for commission ingest cron)
CREATE POLICY service_role_all_affiliate_tracking_keys
  ON public.affiliate_tracking_keys
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
