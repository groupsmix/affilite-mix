-- DB-01 / DB-15: Fix purge_retention() SECURITY DEFINER search_path + extend coverage.
--
-- DB-01: purge_retention() is SECURITY DEFINER without SET search_path.
--   Any role with CREATE on a schema earlier in the resolved search_path
--   can shadow affiliate_clicks / audit_log / stripe_events and force the
--   definer to operate on attacker-controlled relations (CVE-2018-1058).
--   Fix: Re-issue with SET search_path = public, pg_temp and REVOKE
--   EXECUTE FROM PUBLIC.
--
-- DB-15: Extend purge_retention() to cover web_vitals (90d),
--   experiment_events (180d), and ad_impressions (180d) which currently
--   grow unbounded.

CREATE OR REPLACE FUNCTION public.purge_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  clicks_count integer;
  audit_count integer;
  stripe_count integer;
  web_vitals_count integer;
  experiment_events_count integer;
  ad_impressions_count integer;
  result jsonb;
BEGIN
  -- Original retention targets
  DELETE FROM affiliate_clicks WHERE created_at < now() - INTERVAL '365 days';
  GET DIAGNOSTICS clicks_count = ROW_COUNT;

  DELETE FROM audit_log WHERE created_at < now() - INTERVAL '365 days';
  GET DIAGNOSTICS audit_count = ROW_COUNT;

  DELETE FROM stripe_events WHERE received_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS stripe_count = ROW_COUNT;

  -- DB-15: Extended retention targets for unbounded high-write tables
  -- web_vitals: 90 days (high-frequency client perf data)
  IF to_regclass('public.web_vitals') IS NOT NULL THEN
    DELETE FROM web_vitals WHERE created_at < now() - INTERVAL '90 days';
    GET DIAGNOSTICS web_vitals_count = ROW_COUNT;
  ELSE
    web_vitals_count := 0;
  END IF;

  -- experiment_events: 180 days (A/B test event data)
  IF to_regclass('public.experiment_events') IS NOT NULL THEN
    DELETE FROM experiment_events WHERE created_at < now() - INTERVAL '180 days';
    GET DIAGNOSTICS experiment_events_count = ROW_COUNT;
  ELSE
    experiment_events_count := 0;
  END IF;

  -- ad_impressions: 180 days (ad tracking data)
  IF to_regclass('public.ad_impressions') IS NOT NULL THEN
    DELETE FROM ad_impressions WHERE impression_date < now() - INTERVAL '180 days';
    GET DIAGNOSTICS ad_impressions_count = ROW_COUNT;
  ELSE
    ad_impressions_count := 0;
  END IF;

  result := jsonb_build_object(
    'affiliate_clicks_deleted', clicks_count,
    'audit_log_deleted', audit_count,
    'stripe_events_deleted', stripe_count,
    'web_vitals_deleted', web_vitals_count,
    'experiment_events_deleted', experiment_events_count,
    'ad_impressions_deleted', ad_impressions_count
  );

  RETURN result;
END $$;

-- DB-01: Revoke public execute to prevent unprivileged callers from
-- invoking the SECURITY DEFINER function directly.
REVOKE EXECUTE ON FUNCTION public.purge_retention() FROM PUBLIC;

COMMENT ON FUNCTION public.purge_retention() IS
  'DB-01/DB-15: Atomic GDPR data retention purge with SET search_path. Covers affiliate_clicks (365d), audit_log (365d), stripe_events (90d), web_vitals (90d), experiment_events (180d), ad_impressions (180d).';
