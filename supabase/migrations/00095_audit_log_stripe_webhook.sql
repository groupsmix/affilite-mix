-- ============================================================
-- Migration 00095: Audit log Stripe webhook mutations
--
-- A167 / High-leverage fix: Write to audit_log whenever
-- `apply_stripe_membership_event` modifies a membership row.
-- Ensures that Stripe webhook mutations are logged atomically.
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
  v_site_id       UUID;
  v_row_count     INTEGER;
BEGIN
  -- Step 1: idempotency. The PK on `stripe_event_id` guarantees only
  -- one concurrent webhook delivery wins; the others see ROW_COUNT=0
  -- after ON CONFLICT DO NOTHING.
  INSERT INTO stripe_events (stripe_event_id, event_type)
  VALUES (p_stripe_event_id, p_event_type)
  ON CONFLICT (stripe_event_id) DO NOTHING;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    RETURN jsonb_build_object('duplicate', true, 'membership_id', NULL);
  END IF;

  -- Step 2: side effect. Runs in the same transaction as the insert
  -- above, so a RAISE / crash here rolls the event row back along
  -- with any partial membership write.
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

  ELSIF v_op = 'update_status' THEN
    UPDATE memberships
    SET status     = p_event_data ->> 'status',
        updated_at = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id, site_id INTO v_membership_id, v_site_id;

  ELSIF v_op = 'cancel_membership' THEN
    UPDATE memberships
    SET status       = 'cancelled',
        cancelled_at = now(),
        updated_at   = now()
    WHERE stripe_subscription_id = p_event_data ->> 'stripe_subscription_id'
    RETURNING id, site_id INTO v_membership_id, v_site_id;

  ELSIF v_op = 'noop' THEN
    -- Recognised event with no membership change (e.g. an event type
    -- the webhook does not yet handle). The event row is still
    -- recorded so Stripe retries are short-circuited next time.
    NULL;

  ELSE
    RAISE EXCEPTION 'apply_stripe_membership_event: unknown op %', v_op
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Step 3: Write to audit_log if a membership was touched
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
  'LIVE-10 / F-024 / A167: record a Stripe webhook event id, apply the matching '
  'membership side effect, and insert an audit log inside a single transaction. Returns '
  '{duplicate: bool, membership_id: uuid|null}.';
