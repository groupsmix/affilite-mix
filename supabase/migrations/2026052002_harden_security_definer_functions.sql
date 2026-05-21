-- A25 hardening: reduce SECURITY DEFINER foot-guns found in the Season 1 pass.
--
-- 1. Replace erase_subject_data(...) to remove dynamic SQL from the definer body
--    and scope drip_enrollments through its parent drip_campaigns.site_id.
-- 2. Replace apply_stripe_membership_event(...) with explicit argument checks and
--    defensive multi-row guards on subscription-based membership updates.

-- The DSAR erasure path marks membership rows as erased. Older schemas allowed
-- only active/cancelled/expired/past_due, so ensure the state is legal before
-- replacing the function.
DO $$
BEGIN
  IF to_regclass('public.memberships') IS NOT NULL THEN
    ALTER TABLE public.memberships
      DROP CONSTRAINT IF EXISTS memberships_status_check;
    ALTER TABLE public.memberships
      ADD CONSTRAINT memberships_status_check
      CHECK (status IN ('active', 'cancelled', 'expired', 'past_due', 'erased'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.erase_subject_data(
  p_email text,
  p_site_id uuid,
  p_actor text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_lower text := lower(trim(p_email));
  v_count_newsletter int := 0;
  v_count_membership int := 0;
  v_count_comment int := 0;
  v_count_wrist int := 0;
  v_count_quiz int := 0;
  v_count_price_alert int := 0;
  v_count_drip int := 0;
  v_summary jsonb;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RAISE EXCEPTION 'erase_subject_data: email required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'erase_subject_data: site_id required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_actor IS NULL OR length(trim(p_actor)) = 0 THEN
    RAISE EXCEPTION 'erase_subject_data: actor required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  DELETE FROM public.newsletter_subscribers
   WHERE lower(email) = v_lower AND site_id = p_site_id;
  GET DIAGNOSTICS v_count_newsletter = ROW_COUNT;

  UPDATE public.memberships
     SET email = 'erased+' || md5(email || p_site_id::text) || '@example.invalid',
         status = 'erased',
         updated_at = now()
   WHERE lower(email) = v_lower AND site_id = p_site_id;
  GET DIAGNOSTICS v_count_membership = ROW_COUNT;

  IF to_regclass('public.comments') IS NOT NULL THEN
    UPDATE public.comments
       SET user_email = 'erased+' || md5(user_email || p_site_id::text) || '@example.invalid',
           body = '[erased]',
           updated_at = now()
     WHERE lower(user_email) = v_lower AND site_id = p_site_id;
    GET DIAGNOSTICS v_count_comment = ROW_COUNT;
  END IF;

  IF to_regclass('public.wrist_shots') IS NOT NULL THEN
    DELETE FROM public.wrist_shots
     WHERE lower(user_email) = v_lower AND site_id = p_site_id;
    GET DIAGNOSTICS v_count_wrist = ROW_COUNT;
  END IF;

  IF to_regclass('public.quiz_submissions') IS NOT NULL THEN
    DELETE FROM public.quiz_submissions
     WHERE lower(email) = v_lower AND site_id = p_site_id;
    GET DIAGNOSTICS v_count_quiz = ROW_COUNT;
  END IF;

  IF to_regclass('public.price_alerts') IS NOT NULL THEN
    DELETE FROM public.price_alerts
     WHERE lower(email) = v_lower AND site_id = p_site_id;
    GET DIAGNOSTICS v_count_price_alert = ROW_COUNT;
  END IF;

  IF to_regclass('public.drip_enrollments') IS NOT NULL
     AND to_regclass('public.drip_campaigns') IS NOT NULL THEN
    DELETE FROM public.drip_enrollments de
     WHERE lower(de.email) = v_lower
       AND EXISTS (
         SELECT 1
           FROM public.drip_campaigns dc
          WHERE dc.id = de.campaign_id
            AND dc.site_id = p_site_id
       );
    GET DIAGNOSTICS v_count_drip = ROW_COUNT;
  END IF;

  v_summary := jsonb_build_object(
    'newsletter', v_count_newsletter,
    'membership', v_count_membership,
    'comment', v_count_comment,
    'wrist_shot', v_count_wrist,
    'quiz_submission', v_count_quiz,
    'price_alert', v_count_price_alert,
    'drip_enrollment', v_count_drip
  );

  INSERT INTO public.audit_log (actor, action, subject, site_id, payload, created_at)
  VALUES (p_actor, 'gdpr.erasure', p_email, p_site_id, v_summary, now());

  RETURN v_summary;
END;
$$;

REVOKE ALL ON FUNCTION public.erase_subject_data(text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erase_subject_data(text, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_stripe_membership_event(
  p_stripe_event_id TEXT,
  p_event_type      TEXT,
  p_event_data      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_op              TEXT;
  v_membership_id   UUID;
  v_site_id         UUID;
  v_row_count       INTEGER;
  v_membership_rows INTEGER;
BEGIN
  IF p_stripe_event_id IS NULL OR length(trim(p_stripe_event_id)) = 0 THEN
    RAISE EXCEPTION 'apply_stripe_membership_event: stripe event id required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RAISE EXCEPTION 'apply_stripe_membership_event: event type required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_event_data IS NULL OR jsonb_typeof(p_event_data) <> 'object' THEN
    RAISE EXCEPTION 'apply_stripe_membership_event: event data object required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO stripe_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('duplicate', true, 'membership_id', NULL);
  END IF;

  v_op := COALESCE(p_event_data ->> 'op', 'noop');

  IF v_op = 'create_membership' THEN
    INSERT INTO memberships (
      site_id,
      email,
      tier,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_start,
      current_period_end
    )
    VALUES (
      (p_event_data ->> 'site_id')::uuid,
      p_event_data ->> 'email',
      COALESCE(p_event_data ->> 'tier', 'insider'),
      NULLIF(p_event_data ->> 'stripe_customer_id', ''),
      NULLIF(p_event_data ->> 'stripe_subscription_id', ''),
      NULLIF(p_event_data ->> 'current_period_start', '')::timestamptz,
      NULLIF(p_event_data ->> 'current_period_end',   '')::timestamptz
    )
    RETURNING id, site_id INTO v_membership_id, v_site_id;

  ELSIF v_op = 'renew_membership' THEN
    UPDATE memberships
    SET status               = 'active',
        current_period_start = NULLIF(p_event_data ->> 'current_period_start', '')::timestamptz,
        current_period_end   = NULLIF(p_event_data ->> 'current_period_end',   '')::timestamptz,
        updated_at           = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id, site_id INTO v_membership_id, v_site_id;
    GET DIAGNOSTICS v_membership_rows = ROW_COUNT;
    IF v_membership_rows > 1 THEN
      RAISE EXCEPTION 'apply_stripe_membership_event: subscription id matched multiple memberships'
        USING ERRCODE = 'cardinality_violation';
    END IF;

  ELSIF v_op = 'update_status' THEN
    UPDATE memberships
    SET status     = p_event_data ->> 'status',
        tier       = COALESCE(NULLIF(p_event_data ->> 'tier', ''), tier),
        updated_at = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id, site_id INTO v_membership_id, v_site_id;
    GET DIAGNOSTICS v_membership_rows = ROW_COUNT;
    IF v_membership_rows > 1 THEN
      RAISE EXCEPTION 'apply_stripe_membership_event: subscription id matched multiple memberships'
        USING ERRCODE = 'cardinality_violation';
    END IF;

  ELSIF v_op = 'cancel_membership' THEN
    UPDATE memberships
    SET status       = 'cancelled',
        cancelled_at = now(),
        updated_at   = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id, site_id INTO v_membership_id, v_site_id;
    GET DIAGNOSTICS v_membership_rows = ROW_COUNT;
    IF v_membership_rows > 1 THEN
      RAISE EXCEPTION 'apply_stripe_membership_event: subscription id matched multiple memberships'
        USING ERRCODE = 'cardinality_violation';
    END IF;

  ELSIF v_op = 'noop' THEN
    NULL;

  ELSE
    RAISE EXCEPTION 'apply_stripe_membership_event: unknown op %', v_op
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_op != 'noop' AND v_membership_id IS NOT NULL THEN
    INSERT INTO audit_log (
      site_id,
      actor,
      action,
      entity_type,
      entity_id,
      details,
      ip
    ) VALUES (
      COALESCE(v_site_id, '00000000-0000-0000-0000-000000000000'::uuid),
      'stripe-webhook',
      v_op,
      'membership',
      v_membership_id::text,
      jsonb_build_object('event_id', p_stripe_event_id, 'event_type', p_event_type),
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'duplicate', false,
    'membership_id', v_membership_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_membership_event(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_stripe_membership_event(TEXT, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.apply_stripe_membership_event(TEXT, TEXT, JSONB) IS
  'LIVE-10 / F-024 / A167 / A25: atomic Stripe event idempotency, membership side effect, audit log, and defensive argument/cardinality checks.';
