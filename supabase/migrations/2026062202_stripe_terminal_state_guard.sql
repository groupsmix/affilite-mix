-- ============================================================
-- Migration 2026062202: F1 residual — terminal-state guard on Stripe webhook
-- membership mutations.
--
-- BLOCKER residual (audit F1). The reconciliation cron was already hardened
-- (lib/stripe-reconciliation-policy.ts: isReconcilableToActive only allows
-- past_due/expired back to active). But the *live webhook* path still resurrects
-- a deliberately-suspended membership:
--
--   * A full refund  -> cancel_membership  -> status = 'cancelled'
--   * A chargeback   -> update_status      -> status = 'disputed'
--
-- Neither cancels the underlying Stripe subscription, so it stays "active" in
-- Stripe. The next billing cycle then delivers:
--
--   * invoice.paid                  -> renew_membership -> SET status = 'active'
--   * customer.subscription.updated -> update_status     -> SET status = 'active'
--
-- Both unconditionally flipped the row back to 'active', silently undoing the
-- fraud/entitlement hold (re-granting access to a refunded / charged-back
-- customer) — the exact A169-01/A169-02 anti-abuse controls the dispute/refund
-- handlers intend to enforce.
--
-- Fix (authoritative, DB-level so it holds regardless of event ordering or
-- whether the Stripe subscription was ever cancelled): a membership in a
-- TERMINAL state ('disputed' or 'cancelled') may NOT be transitioned back to
-- 'active' by renew_membership or update_status. This mirrors the allowlist in
-- lib/stripe-reconciliation-policy.ts (only past_due/expired are reconcilable
-- to active). Legitimate reactivation after a won dispute must arrive as its own
-- explicit event, never as a side effect of a renewal/status mirror.
--
-- Behaviour preserved from 2026052905 (the effective current definition):
--   * idempotency via stripe_events PK
--   * rowcount guard -> missed_update for out-of-order deliveries
--   * tier update in update_status / create_membership
-- Non-terminal transitions (past_due -> active, active -> past_due, plan/tier
-- changes, disputed -> cancelled, etc.) are unchanged.
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

  IF NOT FOUND THEN
    RETURN jsonb_build_object('duplicate', true, 'membership_id', NULL);
  END IF;

  -- Step 2: side effect
  v_op := p_event_data ->> 'op';

  IF v_op = 'create_membership' THEN
    INSERT INTO memberships (
      site_id,
      email,
      tier,
      status,
      stripe_customer_id,
      stripe_subscription_id,
      current_period_start,
      current_period_end
    ) VALUES (
      (p_event_data ->> 'site_id')::UUID,
      p_event_data ->> 'email',
      COALESCE(p_event_data ->> 'tier', 'free'),
      'active',
      p_event_data ->> 'stripe_customer_id',
      p_event_data ->> 'stripe_subscription_id',
      NULLIF(p_event_data ->> 'current_period_start', '')::timestamptz,
      NULLIF(p_event_data ->> 'current_period_end',   '')::timestamptz
    )
    RETURNING id INTO v_membership_id;

  ELSIF v_op = 'renew_membership' THEN
    -- F1: never resurrect a terminal (disputed/cancelled) membership. The period
    -- columns still advance so the mirror stays accurate, but the entitlement
    -- decision (status) is preserved. Non-terminal rows renew to 'active' as before.
    UPDATE memberships
    SET status               = CASE
                                 WHEN status IN ('disputed', 'cancelled') THEN status
                                 ELSE 'active'
                               END,
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
    -- F1: block only the dangerous terminal -> active transition. A 'disputed' or
    -- 'cancelled' membership cannot be flipped back to 'active' by a Stripe
    -- subscription mirror (e.g. customer.subscription.updated showing the sub
    -- still active because the dispute/refund did not cancel it). All other
    -- transitions, including disputed -> cancelled and past_due -> active, are
    -- preserved. The tier is updated when present, retained when absent.
    UPDATE memberships
    SET status     = CASE
                       WHEN status IN ('disputed', 'cancelled')
                            AND (p_event_data ->> 'status') = 'active'
                       THEN status
                       ELSE p_event_data ->> 'status'
                     END,
        tier       = COALESCE(NULLIF(p_event_data ->> 'tier', ''), tier),
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
    -- Nothing to do; just record the event id above.
    NULL;

  ELSE
    RAISE EXCEPTION 'apply_stripe_membership_event: unknown op "%"', v_op;
  END IF;

  RETURN jsonb_build_object('duplicate', false, 'membership_id', v_membership_id);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_stripe_membership_event(TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_stripe_membership_event(TEXT, TEXT, JSONB) TO service_role;

COMMENT ON FUNCTION public.apply_stripe_membership_event(TEXT, TEXT, JSONB) IS
  'LIVE-10 / F-024 / S1-A10-03 / S11-007 / F1: record a Stripe webhook event and '
  'apply the membership side effect atomically. Terminal states (disputed, '
  'cancelled) cannot be reactivated by renew_membership or update_status. Returns '
  'missed_update=true when an UPDATE matches 0 rows (out-of-order delivery).';
