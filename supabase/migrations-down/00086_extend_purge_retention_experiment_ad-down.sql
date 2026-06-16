-- Rollback 00086: revert purge_retention() to the 00085 version
-- (without experiment_events and ad_impressions coverage).
-- This is a last-resort rollback — the extended coverage is strongly
-- recommended for GDPR compliance.

-- Re-apply the 00085 version of purge_retention() verbatim.
CREATE OR REPLACE FUNCTION public.purge_retention()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  clicks_count             integer := 0;
  audit_count              integer := 0;
  stripe_count             integer := 0;
  newsletter_count         integer := 0;
  quiz_count               integer := 0;
  comments_count           integer := 0;
  web_vitals_count         integer := 0;

  AFFILIATE_CLICKS_DAYS    integer := 365;
  AUDIT_LOG_DAYS           integer := 365;
  STRIPE_EVENTS_DAYS       integer := 90;
  NEWSLETTER_UNCONFIRMED_DAYS integer := 30;
  QUIZ_SUBMISSIONS_DAYS    integer := 365;
  COMMENTS_DELETED_DAYS    integer := 30;
  WEB_VITALS_DAYS          integer := 90;
BEGIN
  DELETE FROM public.affiliate_clicks
  WHERE  created_at < now() - make_interval(days => AFFILIATE_CLICKS_DAYS);
  GET DIAGNOSTICS clicks_count = ROW_COUNT;

  DELETE FROM public.audit_log
  WHERE  created_at < now() - make_interval(days => AUDIT_LOG_DAYS);
  GET DIAGNOSTICS audit_count = ROW_COUNT;

  DELETE FROM public.stripe_events
  WHERE  received_at < now() - make_interval(days => STRIPE_EVENTS_DAYS);
  GET DIAGNOSTICS stripe_count = ROW_COUNT;

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

  RETURN jsonb_build_object(
    'affiliate_clicks_deleted',        clicks_count,
    'audit_log_deleted',               audit_count,
    'stripe_events_deleted',           stripe_count,
    'newsletter_subscribers_deleted',  newsletter_count,
    'quiz_submissions_deleted',        quiz_count,
    'comments_deleted',                comments_count,
    'web_vitals_deleted',              web_vitals_count
  );
END
$$;

COMMENT ON FUNCTION public.purge_retention() IS
  'F-DB-03 + audit S-10: atomic GDPR retention purge (00085 version).';

REVOKE EXECUTE ON FUNCTION public.purge_retention() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_retention() TO service_role;
