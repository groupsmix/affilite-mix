-- ═══════════════════════════════════════════════════════════════════
-- Migration 2026062501: Handle orphaned duplicate subscriptions on
-- create_membership (Issue 3 / P1 — double-billing prevention).
--
-- Problem:
--   Two concurrent Stripe Checkout sessions for the same email + site
--   can both complete payment, creating two Stripe subscriptions. The
--   KV lock in the checkout route only covers the session-creation
--   step (released in `finally`), not the payment-completion step
--   which happens on Stripe's side, potentially minutes later.
--
--   When the second webhook fires create_membership, the INSERT hits
--   the unique partial index idx_memberships_email_site
--   (email, site_id WHERE status = 'active') and raises a 23505
--   unique_violation. Previously this rolled back the entire
--   transaction (including the stripe_events idempotency row), so
--   Stripe retried, hit the same error, and the event eventually
--   landed in the DLQ — leaving the orphaned subscription active and
--   billing the customer.
--
-- Fix:
--   Catch the unique_violation inside the RPC. Instead of raising,
--   record the event as processed (so Stripe does not retry) and
--   return a JSONB flag `orphan_subscription_id` so the application
--   layer can cancel the orphaned Stripe subscription via the API.
--
--   The RPC cannot call the Stripe API itself (no network access from
--   plpgsql), so cancellation is deferred to the event processor in
--   lib/stripe-event-processor.ts, which checks the return value and
--   calls stripe.subscriptions.cancel() when an orphan is detected.
--
-- Rollback:
--   DROP and re-create the function from 00070_atomic_stripe_event_apply.sql
--   (restores the unhandled unique_violation behavior — do not run
--   unless reverting this fix).
-- ═══════════════════════════════════════════════════════════════════

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
  v_orphan_sub_id TEXT;
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
    -- Issue 3: wrap the INSERT in a sub-block so we can catch the
    -- unique_violation (23505) on idx_memberships_email_site instead
    -- of letting it abort the entire transaction. The event row stays
    -- committed (Stripe won't retry), and we return the orphaned
    -- subscription id so the application layer can cancel it via the
    -- Stripe API.
    BEGIN
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
    EXCEPTION
      WHEN unique_violation THEN
        -- A membership already exists for this email + site (active).
        -- The Stripe subscription that triggered this webhook is an
        -- orphan — it must be cancelled to stop double-billing.
        v_membership_id := NULL;
        v_orphan_sub_id := p_event_data ->> 'stripe_subscription_id';

        -- Audit: record that an orphan was detected so we can monitor
        -- frequency and verify the application-layer cancellation ran.
        INSERT INTO audit_log (site_id, actor, action, entity_type, entity_id, details)
        VALUES (
          (p_event_data ->> 'site_id')::uuid,
          'stripe-webhook',
          'orphan_subscription_detected',
          'membership',
          v_orphan_sub_id,
          jsonb_build_object(
            'email', p_event_data ->> 'email',
            'event_id', p_stripe_event_id,
            'event_type', p_event_type
          )
        );
    END;

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
    -- Recognised event with no membership change. The event row is
    -- still recorded so Stripe retries are short-circuited next time.
    NULL;

  ELSE
    RAISE EXCEPTION 'apply_stripe_membership_event: unknown op %', v_op
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN jsonb_build_object(
    'duplicate', false,
    'membership_id', v_membership_id,
    'orphan_subscription_id', NULLIF(v_orphan_sub_id, '')
  );
END;
$$;

COMMENT ON FUNCTION public.apply_stripe_membership_event(TEXT, TEXT, JSONB) IS
  'LIVE-10 / F-024: record a Stripe webhook event id and apply the matching '
  'membership side effect in a single transaction. Returns '
  '{duplicate: bool, membership_id: uuid|null, orphan_subscription_id: text|null}. '
  'When orphan_subscription_id is non-null, the application layer must cancel '
  'that Stripe subscription to prevent double-billing (Issue 3).';
