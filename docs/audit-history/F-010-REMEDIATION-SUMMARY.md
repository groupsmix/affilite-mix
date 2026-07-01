# F-010 Remediation Summary

## Finding

**F-010:** Stripe webhook idempotency relies on application-layer replay table; need verification under chaos

## Severity

**Priority:** P1 **Effort:** S

## Remediation Completed

### 1. Chaos Test for Concurrent Webhook Delivery ✅

**File:** `__tests__/chaos/stripe-webhook-concurrent.test.ts`

**What was tested:**

- Concurrent identical webhook deliveries (2 concurrent requests)
- Triple concurrent deliveries (3 concurrent requests)
- Out-of-order delivery handling (invoice.paid before checkout.session.completed)

**Key assertions:**

- Exactly one membership credit granted per unique event
- ON CONFLICT DO NOTHING prevents double-credit
- Rowcount guard prevents silent data loss on out-of-order events

### 2. Idempotency Verification ✅

**Verified:** The existing implementation in `supabase/migrations/2026052902_s1_stripe_rowcount_guard.sql` correctly implements:

- `INSERT INTO stripe_events ... ON CONFLICT (stripe_event_id) DO NOTHING`
- `ROW_COUNT` check after insert to detect duplicates
- Returns `duplicate: true` when insert loses

This matches the audit recommendation exactly.

### 3. Stripe Restricted Key Verification ⚠️

**Status:** Requires manual verification in production

**Action required:**
Run the following command to verify the production secret:

```bash
wrangler secret list
```

**Expected result:**

```
STRIPE_SECRET_KEY  rk_live_*
```

**Not acceptable:**

```
STRIPE_SECRET_KEY  sk_live_*
```

The test file includes a pattern validation that can be used in CI if the secret is available.

## Evidence

### 1. ON CONFLICT Implementation

**File:** `supabase/migrations/2026052902_s1_stripe_rowcount_guard.sql:29-37`

```sql
INSERT INTO stripe_events (stripe_event_id, event_type)
VALUES (p_stripe_event_id, p_event_type)
ON CONFLICT (stripe_event_id) DO NOTHING;

GET DIAGNOSTICS v_row_count = ROW_COUNT;

IF v_row_count = 0 THEN
  RETURN jsonb_build_object('duplicate', true, 'membership_id', NULL);
END IF;
```

### 2. Chaos Test Coverage

**File:** `__tests__/chaos/stripe-webhook-concurrent.test.ts`

- Tests concurrent identical webhook delivery
- Tests triple concurrent delivery
- Tests out-of-order delivery with rowcount guard

### 3. Verification Steps

The chaos test simulates the exact race condition described in the audit:

> "race conditions between two concurrent isolates handling the same retry can produce a double-grant on the worst day"

The test confirms:

- Only one insert succeeds (ON CONFLICT)
- Only one credit is granted
- Subsequent requests return `duplicate: true`

## Remaining Manual Steps

1. Verify production STRIPE*SECRET_KEY starts with `rk_live*` (restricted key)
2. If using `sk_live_`, rotate to a restricted key with minimal permissions
3. Document the key rotation in `docs/secrets-rotation-runbook.md`

## Status

**F-010:** ✅ **COMPLETED** (pending production secret verification)
