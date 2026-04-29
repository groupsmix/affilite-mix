-- DB-15: Extend purge_retention() to cover experiment_events (180d)
-- and ad_impressions (180d) which previously grew unbounded.
--
-- This builds on 00085's purge_retention() which already covers:
--   affiliate_clicks (365d), audit_log (365d), stripe_events (90d),
--   newsletter_subscribers (pending >30d), quiz_submissions (365d),
--   comments (status=deleted >30d), web_vitals (90d).
--
-- We add two high-write analytics tables that were flagged in the
-- consolidated audit (DB-15):
--   * experiment_events — A/B test event data, 180-day retention
--   * ad_impressions    — ad tracking data, 180-day retention
--
-- Idempotent: CREATE OR REPLACE FUNCTION; safe to re-run.

CREATE OR REPLACE FUNCTION public.purge_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  clicks_count               integer := 0;
  audit_count                integer := 0;
  stripe_count               integer := 0;
  newsletter_count           integer := 0;
  quiz_count                 integer := 0;
  comments_count             integer := 0;
  web_vitals_count           integer := 0;
  experiment_events_count    integer := 0;
  ad_impressions_count       integer := 0;

  -- Tunables. Keep these in lock-step with docs/ropa.md.
  AFFILIATE_CLICKS_DAYS        integer := 365;
  AUDIT_LOG_DAYS               integer := 365;
  STRIPE_EVENTS_DAYS           integer := 90;
  NEWSLETTER_UNCONFIRMED_DAYS  integer := 30;
  QUIZ_SUBMISSIONS_DAYS        integer := 365;
  COMMENTS_DELETED_DAYS        integer := 30;
  WEB_VITALS_DAYS              integer := 90;
  EXPERIMENT_EVENTS_DAYS       integer := 180;
  AD_IMPRESSIONS_DAYS          integer := 180;
BEGIN
  -- Existing windows from 00077 ────────────────────────────────────
  DELETE FROM public.affiliate_clicks
  WHERE  created_at < now() - make_interval(days => AFFILIATE_CLICKS_DAYS);
  GET DIAGNOSTICS clicks_count = ROW_COUNT;

  DELETE FROM public.audit_log
  WHERE  created_at < now() - make_interval(days => AUDIT_LOG_DAYS);
  GET DIAGNOSTICS audit_count = ROW_COUNT;

  DELETE FROM public.stripe_events
  WHERE  received_at < now() - make_interval(days => STRIPE_EVENTS_DAYS);
  GET DIAGNOSTICS stripe_count = ROW_COUNT;

  -- Windows from 00085 ─────────────────────────────────────────────
  IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
    DELETE FROM public.newsletter_subscribers
    WHERE  status = 'pending'
      AND  created_at < now() - make_interval(days => NEWSLETTER_UNCONFIRMED_DAYS);
    GET DIAGNOSTICS newsletter_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.quiz_submissions') IS NOT NULL THEN
    DELETE FROM public.quiz_submissions
    WHERE  created_at < now() - make_interval(days => QUIZ_SUBMISSIONS_DAYS);
    GET DIAGNOSTICS quiz_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.comments') IS NOT NULL THEN
    DELETE FROM public.comments
    WHERE  status = 'deleted'
      AND  COALESCE(updated_at, created_at) < now() - make_interval(days => COMMENTS_DELETED_DAYS);
    GET DIAGNOSTICS comments_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.web_vitals') IS NOT NULL THEN
    DELETE FROM public.web_vitals
    WHERE  created_at < now() - make_interval(days => WEB_VITALS_DAYS);
    GET DIAGNOSTICS web_vitals_count = ROW_COUNT;
  END IF;

  -- DB-15: New windows added in 00086 ──────────────────────────────
  IF to_regclass('public.experiment_events') IS NOT NULL THEN
    DELETE FROM public.experiment_events
    WHERE  created_at < now() - make_interval(days => EXPERIMENT_EVENTS_DAYS);
    GET DIAGNOSTICS experiment_events_count = ROW_COUNT;
  END IF;

  IF to_regclass('public.ad_impressions') IS NOT NULL THEN
    DELETE FROM public.ad_impressions
    WHERE  impression_date < now() - make_interval(days => AD_IMPRESSIONS_DAYS);
    GET DIAGNOSTICS ad_impressions_count = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'affiliate_clicks_deleted',        clicks_count,
    'audit_log_deleted',               audit_count,
    'stripe_events_deleted',           stripe_count,
    'newsletter_subscribers_deleted',  newsletter_count,
    'quiz_submissions_deleted',        quiz_count,
    'comments_deleted',                comments_count,
    'web_vitals_deleted',              web_vitals_count,
    'experiment_events_deleted',       experiment_events_count,
    'ad_impressions_deleted',          ad_impressions_count
  );
END
$$;

COMMENT ON FUNCTION public.purge_retention() IS
  'DB-15 + S-10: atomic GDPR retention purge. Deletes expired rows from affiliate_clicks (365d), audit_log (365d), stripe_events (90d), newsletter_subscribers (pending >30d), quiz_submissions (365d), comments (status=deleted >30d), web_vitals (90d), experiment_events (180d), ad_impressions (180d).';

REVOKE EXECUTE ON FUNCTION public.purge_retention() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_retention() TO service_role;
