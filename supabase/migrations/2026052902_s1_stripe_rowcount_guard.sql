-- ============================================================
-- Migration 2026052902: S1-A10-03 — rowcount guard on stripe mutations
--
-- renew/update/cancel UPDATEs by stripe_subscription_id without
-- checking ROW_COUNT: if a renew is delivered before create_membership
-- (out-of-order webhook), it matches 0 rows but the event is still
-- recorded as processed → that renewal is silently lost.
--
-- Fix: RAISE WARNING + return a flag when ROW_COUNT = 0 on a
-- mutation op so the caller can queue to DLQ / retry.
-- ============================================================

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
  v_op            TEXT;
  v_membership_id UUID;
  v_row_count     INTEGER;
BEGIN
  -- Step 1: idempotency
  INSERT INTO stripe_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('duplicate', true, 'membership_id', NULL);
  END IF;

  -- Step 2: side effect
  v_op := COALESCE(p_event_data ->> 'op', 'noop');

  IF v_op = 'create_membership' THEN
    INSERT INTO memberships (
      site_id, email, tier,
      stripe_customer_id, stripe_subscription_id,
      current_period_start, current_period_end
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
    RETURNING id INTO v_membership_id;

  ELSIF v_op = 'renew_membership' THEN
    UPDATE memberships
    SET status               = 'active',
        current_period_start = NULLIF(p_event_data ->> 'current_period_start', '')::timestamptz,
        current_period_end   = NULLIF(p_event_data ->> 'current_period_end',   '')::timestamptz,
        updated_at           = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id INTO v_membership_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      RAISE WARNING 'apply_stripe_membership_event: renew_membership matched 0 rows (out-of-order?), event_id=%', p_stripe_event_id;
      RETURN jsonb_build_object('duplicate', false, 'membership_id', NULL, 'missed_update', true, 'op', v_op);
    END IF;

  ELSIF v_op = 'update_status' THEN
    UPDATE memberships
    SET status     = p_event_data ->> 'status',
        updated_at = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id INTO v_membership_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      RAISE WARNING 'apply_stripe_membership_event: update_status matched 0 rows (out-of-order?), event_id=%', p_stripe_event_id;
      RETURN jsonb_build_object('duplicate', false, 'membership_id', NULL, 'missed_update', true, 'op', v_op);
    END IF;

  ELSIF v_op = 'cancel_membership' THEN
    UPDATE memberships
    SET status       = 'cancelled',
        cancelled_at = now(),
        updated_at   = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id INTO v_membership_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    IF v_row_count = 0 THEN
      RAISE WARNING 'apply_stripe_membership_event: cancel_membership matched 0 rows (out-of-order?), event_id=%', p_stripe_event_id;
      RETURN jsonb_build_object('duplicate', false, 'membership_id', NULL, 'missed_update', true, 'op', v_op);
    END IF;

  ELSIF v_op = 'noop' THEN
    NULL;

  ELSE
    RAISE EXCEPTION 'apply_stripe_membership_event: unknown op %', v_op
      USING ERRCODE = 'invalid_parameter_value';
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
  'LIVE-10 / F-024 / S1-A10-03: record a Stripe webhook event and apply '
  'membership side effect atomically. Returns missed_update=true when an '
  'UPDATE matches 0 rows (out-of-order delivery).';
