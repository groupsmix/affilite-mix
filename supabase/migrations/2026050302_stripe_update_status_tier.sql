-- ============================================================
-- Migration 2026050302: Fix update_status to persist tier field
--
-- OF-07: The processor sends a `tier` field on `update_status` ops
-- (for mid-cycle tier changes), but the RPC ignored it. This
-- migration replaces the function to SET tier when provided.
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
  -- Step 1: idempotency.
  INSERT INTO stripe_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('duplicate', true, 'membership_id', NULL);
  END IF;

  -- Step 2: side effect.
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
    RETURNING id INTO v_membership_id;

  ELSIF v_op = 'renew_membership' THEN
    UPDATE memberships
    SET status               = 'active',
        current_period_start = NULLIF(p_event_data ->> 'current_period_start', '')::timestamptz,
        current_period_end   = NULLIF(p_event_data ->> 'current_period_end',   '')::timestamptz,
        updated_at           = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id INTO v_membership_id;

  ELSIF v_op = 'update_status' THEN
    -- OF-07: Also persist tier when provided (mid-cycle tier change).
    UPDATE memberships
    SET status     = p_event_data ->> 'status',
        tier       = COALESCE(NULLIF(p_event_data ->> 'tier', ''), tier),
        updated_at = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id INTO v_membership_id;

  ELSIF v_op = 'cancel_membership' THEN
    UPDATE memberships
    SET status       = 'cancelled',
        cancelled_at = now(),
        updated_at   = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id INTO v_membership_id;

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
  'LIVE-10 / F-024 / OF-07: record a Stripe webhook event id and apply the '
  'matching membership side effect in a single transaction. The update_status '
  'branch now also persists the tier field for mid-cycle tier changes.';
