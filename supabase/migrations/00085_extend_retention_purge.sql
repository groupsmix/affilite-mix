-- ═══════════════════════════════════════════════════════════════════
-- Migration 00085 (audit S-10): extend public.purge_retention()
--                              for full GDPR Art. 5(1)(e) coverage
-- ═══════════════════════════════════════════════════════════════════
--
-- Background
-- ----------
-- The 00077 retention purge only deletes from
-- `affiliate_clicks` / `audit_log` / `stripe_events`. The audit
-- (S-10) flagged that the following personal-data tables have no
-- automated retention, in violation of GDPR Article 5(1)(e):
--
--   * `newsletter_subscribers` — unconfirmed double-opt-in rows
--     should be deleted after 30 days (no legal basis to keep them
--     once consent has lapsed).
--
--   * `quiz_submissions` — lead-gen submissions; default retention
--     365 days then delete (caller may extend per-site).
--
--   * `comments` — author-deleted comments (status='deleted') should
--     be hard-deleted after 30 days; the soft-delete already hides
--     them from public reads but the row + body still exists.
--
--   * `web_vitals` — performance telemetry. The schema as of
--     00023 stores `href` (full URL) and may transitively contain
--     PII via the URL path; retain ≤ 90 days.
--
-- Schema notes (verified on staging via the management SQL endpoint
-- on 2026-04-29):
--   * `newsletter_subscribers.created_at` exists.
--   * `quiz_submissions.created_at` exists.
--   * `comments.status` and `comments.updated_at` exist; soft-delete
--     marker is `status='deleted'`.
--   * `web_vitals.created_at` exists.
--
-- Cron contract
-- -------------
-- The existing `/api/cron/data-retention` route invokes
-- `purge_retention()` (no-arg form) and falls back to a per-table
-- path if the RPC fails. We preserve the no-arg form and return a
-- jsonb summary keyed by table name so existing code continues to
-- work.
--
-- The `purge_retention(p_table, p_cutoff, p_batch_limit)` overload
-- referenced by the cron's audit_log archive path is left untouched
-- (it lives elsewhere if it exists; this migration does not assume
-- so).
--
-- Idempotent: CREATE OR REPLACE FUNCTION; safe to re-run.

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

  -- Tunables. Keep these in lock-step with docs/ropa.md.
  AFFILIATE_CLICKS_DAYS    integer := 365;
  AUDIT_LOG_DAYS           integer := 365;
  STRIPE_EVENTS_DAYS       integer := 90;
  NEWSLETTER_UNCONFIRMED_DAYS integer := 30;
  QUIZ_SUBMISSIONS_DAYS    integer := 365;
  COMMENTS_DELETED_DAYS    integer := 30;
  WEB_VITALS_DAYS          integer := 90;
BEGIN
  -- Existing windows from 00077 ────────────────────────────────────
  DELETE FROM public.affiliate_clicks
  WHERE  created_at < now() - make_interval(days => AFFILIATE_CLICKS_DAYS);
  GET DIAGNOSTICS clicks_count = ROW_COUNT;

  DELETE FROM public.audit_log
  WHERE  created_at < now() - make_interval(days => AUDIT_LOG_DAYS);
  GET DIAGNOSTICS audit_count = ROW_COUNT;

  -- stripe_events.received_at is the canonical timestamp; created_at
  -- (added in 00081) carries the same value via backfill but
  -- received_at is what the table was originally indexed on.
  DELETE FROM public.stripe_events
  WHERE  received_at < now() - make_interval(days => STRIPE_EVENTS_DAYS);
  GET DIAGNOSTICS stripe_count = ROW_COUNT;

  -- New windows added in 00085 ─────────────────────────────────────

  -- Unconfirmed double-opt-in rows. Status is 'pending' until the
  -- user clicks the confirmation email; if 30 days pass the consent
  -- evidence is stale and we MUST drop the row (GDPR Art. 7).
  IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
    DELETE FROM public.newsletter_subscribers
    WHERE  status = 'pending'
      AND  created_at < now() - make_interval(days => NEWSLETTER_UNCONFIRMED_DAYS);
    GET DIAGNOSTICS newsletter_count = ROW_COUNT;
  END IF;

  -- Quiz submissions older than the legal-basis window. Per ropa.md
  -- the lawful basis is consent; 365 days is the default.
  IF to_regclass('public.quiz_submissions') IS NOT NULL THEN
    DELETE FROM public.quiz_submissions
    WHERE  created_at < now() - make_interval(days => QUIZ_SUBMISSIONS_DAYS);
    GET DIAGNOSTICS quiz_count = ROW_COUNT;
  END IF;

  -- Comments soft-deleted by the author. The public surface already
  -- hides them; this hard-deletes after the dispute window.
  IF to_regclass('public.comments') IS NOT NULL THEN
    DELETE FROM public.comments
    WHERE  status = 'deleted'
      AND  COALESCE(updated_at, created_at) < now() - make_interval(days => COMMENTS_DELETED_DAYS);
    GET DIAGNOSTICS comments_count = ROW_COUNT;
  END IF;

  -- web_vitals carries `href` (full URL) which can transitively
  -- contain PII (query strings, share tokens). 90-day TTL.
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
  'F-DB-03 + audit S-10: atomic GDPR retention purge. Deletes expired rows from affiliate_clicks (365d), audit_log (365d), stripe_events (90d), newsletter_subscribers (pending >30d), quiz_submissions (365d), comments (status=deleted >30d), web_vitals (90d). Tunables documented in docs/ropa.md.';

-- The function is owned by `postgres` and SECURITY DEFINER; lock it
-- down so only the cron service-role can invoke it (the scheduler /
-- cron route uses the privileged client).
REVOKE EXECUTE ON FUNCTION public.purge_retention() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_retention() TO service_role;
