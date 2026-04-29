-- DB-16: GDPR Art. 17 erase_user RPC.
--
-- Anonymises all PII for a given email across every table that stores
-- plain-text email addresses. This is the central helper for handling
-- data erasure requests without requiring manual per-table intervention.
--
-- PII inventory (as of this migration):
--   1. newsletter_subscribers.email
--   2. memberships.email
--   3. comments.user_email
--   4. wrist_shots.user_email
--   5. quiz_submissions.email
--   6. drip_enrollments.email
--   7. price_alerts.email
--
-- The function is SECURITY DEFINER so it can bypass RLS, and is
-- restricted to service_role only (via 00083's blanket REVOKE pattern).

-- ── Widen CHECK constraints so the erasure / soft-delete statuses below
--    (and the existing purge_retention() function in 00085 which already
--    assumes comments.status='deleted' is valid) satisfy table constraints.
--
--   newsletter_subscribers.status: add 'erased'  (allowed set originally
--     defined as ('pending','active','unsubscribed') in 00001).
--   comments.status:               add 'deleted' (allowed set originally
--     defined as ('pending','approved','rejected','spam') in 00050).
--
-- Both DO blocks are defensive so the migration is idempotent and also
-- survives environments where the CHECK constraint is absent or named
-- differently. Constraint names match the PostgreSQL defaults produced
-- by CHECK clauses defined inline with CREATE TABLE.
DO $$
BEGIN
  IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
    ALTER TABLE public.newsletter_subscribers
      DROP CONSTRAINT IF EXISTS newsletter_subscribers_status_check;
    ALTER TABLE public.newsletter_subscribers
      ADD CONSTRAINT newsletter_subscribers_status_check
      CHECK (status IN ('pending', 'active', 'unsubscribed', 'erased'));
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.comments') IS NOT NULL THEN
    ALTER TABLE public.comments
      DROP CONSTRAINT IF EXISTS comments_status_check;
    ALTER TABLE public.comments
      ADD CONSTRAINT comments_status_check
      CHECK (status IN ('pending', 'approved', 'rejected', 'spam', 'deleted'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.erase_user(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  anonymized_email text;
  result jsonb;
  newsletter_count integer := 0;
  memberships_count integer := 0;
  comments_count integer := 0;
  wrist_shots_count integer := 0;
  quiz_count integer := 0;
  drip_count integer := 0;
  price_alerts_count integer := 0;
BEGIN
  IF p_email IS NULL OR p_email = '' THEN
    RAISE EXCEPTION 'erase_user: p_email must not be empty';
  END IF;

  -- Generate a deterministic anonymized placeholder so we can track
  -- that an erasure happened without retaining the original PII.
  anonymized_email := 'erased-' || encode(digest(p_email, 'sha256'), 'hex')::text;

  -- 1. newsletter_subscribers
  IF to_regclass('public.newsletter_subscribers') IS NOT NULL THEN
    UPDATE public.newsletter_subscribers
    SET    email = anonymized_email,
           status = 'erased',
           confirmation_token = NULL,
           unsubscribe_token = NULL
    WHERE  email = p_email;
    GET DIAGNOSTICS newsletter_count = ROW_COUNT;
  END IF;

  -- 2. memberships
  IF to_regclass('public.memberships') IS NOT NULL THEN
    UPDATE public.memberships
    SET    email = anonymized_email
    WHERE  email = p_email;
    GET DIAGNOSTICS memberships_count = ROW_COUNT;
  END IF;

  -- 3. comments
  IF to_regclass('public.comments') IS NOT NULL THEN
    UPDATE public.comments
    SET    user_email = anonymized_email,
           user_name = 'Deleted User',
           body = '[Content removed per erasure request]',
           status = 'deleted'
    WHERE  user_email = p_email;
    GET DIAGNOSTICS comments_count = ROW_COUNT;
  END IF;

  -- 4. wrist_shots
  IF to_regclass('public.wrist_shots') IS NOT NULL THEN
    UPDATE public.wrist_shots
    SET    user_email = anonymized_email,
           user_name = 'Deleted User'
    WHERE  user_email = p_email;
    GET DIAGNOSTICS wrist_shots_count = ROW_COUNT;
  END IF;

  -- 5. quiz_submissions
  IF to_regclass('public.quiz_submissions') IS NOT NULL THEN
    UPDATE public.quiz_submissions
    SET    email = anonymized_email
    WHERE  email = p_email;
    GET DIAGNOSTICS quiz_count = ROW_COUNT;
  END IF;

  -- 6. drip_enrollments
  IF to_regclass('public.drip_enrollments') IS NOT NULL THEN
    UPDATE public.drip_enrollments
    SET    email = anonymized_email
    WHERE  email = p_email;
    GET DIAGNOSTICS drip_count = ROW_COUNT;
  END IF;

  -- 7. price_alerts
  IF to_regclass('public.price_alerts') IS NOT NULL THEN
    UPDATE public.price_alerts
    SET    email = anonymized_email
    WHERE  email = p_email;
    GET DIAGNOSTICS price_alerts_count = ROW_COUNT;
  END IF;

  result := jsonb_build_object(
    'email_hash', anonymized_email,
    'newsletter_subscribers', newsletter_count,
    'memberships', memberships_count,
    'comments', comments_count,
    'wrist_shots', wrist_shots_count,
    'quiz_submissions', quiz_count,
    'drip_enrollments', drip_count,
    'price_alerts', price_alerts_count
  );

  RETURN result;
END $$;

-- Restrict to service_role only
REVOKE EXECUTE ON FUNCTION public.erase_user(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_user(text) TO service_role;

COMMENT ON FUNCTION public.erase_user(text) IS
  'DB-16: GDPR Art. 17 erasure RPC. Anonymises all PII for the given email across 7 tables.';
