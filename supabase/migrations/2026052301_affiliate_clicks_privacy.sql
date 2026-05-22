-- A158/A162: Click deduplication fingerprint + IP privacy minimization.
--
-- A158: Add a `fingerprint` column (HMAC of cookie+IP+UA) for 24-hour
--       per-(campaign, fingerprint) dedup to prevent click fraud / cookie stuffing.
--
-- A162: Add an `ip_prefix` column storing only the /24 prefix of the visitor IP
--       for analytics (e.g. 203.0.113.x). The full IP is never stored.
--       A cron job zeros ip_prefix to NULL after 30 days to further minimize PII.
--
--       Note: The fingerprint itself is an HMAC (not raw PII) and is set to NULL
--       after the 24-hour dedup window elapses. The data-retention cron handles
--       this cleanup.

DO $$
BEGIN
  -- ip_prefix: stores only the /24 prefix (e.g. "203.0.113") — never the full IP.
  -- Nulled by data-retention cron after 30 days per A162.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliate_clicks'
      AND column_name = 'ip_prefix'
  ) THEN
    ALTER TABLE public.affiliate_clicks
      ADD COLUMN ip_prefix TEXT DEFAULT NULL;

    COMMENT ON COLUMN public.affiliate_clicks.ip_prefix IS
      'A162: /24 IP prefix for analytics only (e.g. "203.0.113"). '
      'Full IP is never stored. Nulled after 30 days by data-retention cron.';
  END IF;

  -- fingerprint: HMAC(secret, campaign||ip_prefix||ua_hash) for 24h dedup.
  -- Used only for dedup; nulled after 24h by data-retention cron.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'affiliate_clicks'
      AND column_name = 'fingerprint'
  ) THEN
    ALTER TABLE public.affiliate_clicks
      ADD COLUMN fingerprint TEXT DEFAULT NULL;

    COMMENT ON COLUMN public.affiliate_clicks.fingerprint IS
      'A158: HMAC fingerprint (cookie+IP/24+UA) for 24h click dedup. '
      'Not raw PII. Nulled after 24 hours by data-retention cron.';
  END IF;
END $$;

-- Index to make 24h dedup lookups fast:
-- "has this fingerprint been seen for this campaign in the last 24h?"
CREATE INDEX IF NOT EXISTS affiliate_clicks_dedup_idx
  ON public.affiliate_clicks (site_id, content_slug, fingerprint, created_at)
  WHERE fingerprint IS NOT NULL;
