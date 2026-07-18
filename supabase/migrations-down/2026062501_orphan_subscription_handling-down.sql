-- 2026062501_orphan_subscription_handling-down
--
-- Rollback for 2026062501_orphan_subscription_handling.sql.
--
-- Restores the original apply_stripe_membership_event function from
-- 00070_atomic_stripe_event_apply.sql (without orphan handling).
--
-- WARNING: running this rollback re-introduces the double-billing risk
-- where a unique_violation on create_membership aborts the transaction,
-- Stripe retries, and the orphaned subscription keeps billing. Only run
-- if reverting the fix and accept that double-billing may recur.

-- Re-create the original function from 00070.
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
    UPDATE memberships
    SET status     = p_event_data ->> 'status',
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

COMMENT ON FUNCTION public.apply_stripe_membership_event(TEXT, TEXT, JSONB) IS
  'LIVE-10 / F-024: record a Stripe webhook event id and apply the matching '
  'membership side effect in a single transaction. Returns '
  '{duplicate: bool, membership_id: uuid|null}.';
