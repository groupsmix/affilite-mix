# Runbook: Stripe Webhook Failure

> **Severity**: P2 — High (revenue-impacting if sustained)
> **Response time**: < 1 hour
> **Escalation**: Slack `#incidents` + email billing owner

## Symptoms

- Stripe Dashboard → Webhooks shows failed deliveries
- `webhook_dlq` table has new rows
- Sentry errors: `StripeSignatureVerificationError` or webhook handler exceptions
- Customer reports: subscription not activated, payment not reflected

## Diagnosis

### Step 1: Check Stripe Dashboard

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Click on the endpoint for affilite-mix
3. Check "Recent deliveries" for failed events
4. Note the failure reason (signature mismatch, timeout, 500, etc.)

### Step 2: Check the DLQ

```sql
-- Check for unprocessed dead letters
SELECT id, event_type, created_at, error_message, retry_count
FROM webhook_dlq
WHERE processed_at IS NULL
ORDER BY created_at DESC
LIMIT 20;
```

### Step 3: Check Sentry

Search: `StripeSignatureVerificationError OR stripe_webhook_error`

## Common Causes and Fixes

### Signature Verification Failure

**Cause**: Webhook signing secret mismatch (rotated in Stripe but not updated
in Worker secrets).

**Fix**:

```bash
# Get the current signing secret from Stripe Dashboard → Webhooks → Signing secret
wrangler secret put STRIPE_WEBHOOK_SECRET
# Paste the new secret when prompted
```

### Handler Timeout

**Cause**: Webhook handler exceeds the Cloudflare Worker CPU limit.

**Fix**: Check if a specific event type triggers heavy processing. Consider
moving heavy processing to a queue.

### Database Error During Processing

**Cause**: Supabase is down or a migration changed the schema.

**Fix**: Resolve the database issue first (see `database-outage.md`). Then
replay failed events from the DLQ.

### Endpoint URL Mismatch

**Cause**: Deployment changed the URL but Stripe still points to the old one.

**Fix**: Update the webhook endpoint URL in Stripe Dashboard → Webhooks.

## Replay Failed Events

### Using the DLQ drain script

```bash
# Replay all unprocessed events
npx tsx scripts/drain-dlq.ts

# Replay a specific event
npx tsx scripts/drain-dlq.ts --event-id=<stripe-event-id>
```

### Manual replay from Stripe

1. Go to Stripe Dashboard → Webhooks → Failed deliveries
2. Click "Resend" on each failed event
3. Monitor for successful processing

## Recovery Checklist

- [ ] Root cause identified and fixed
- [ ] All DLQ events replayed successfully
- [ ] Stripe Dashboard shows successful deliveries
- [ ] No Sentry errors related to webhooks
- [ ] Customer-reported issues resolved
- [ ] Post-incident report written

## Prevention

- Alert when `webhook_dlq` row count > 0 (check via cron)
- Monitor Stripe webhook success rate in Stripe Dashboard
- Rotate webhook secrets via a documented procedure (update both Stripe
  and Worker secrets simultaneously)
- Test webhook handling after every deploy that touches payment code

## References

- `app/api/stripe/webhook/route.ts` — webhook handler
- `scripts/drain-dlq.ts` — DLQ replay script
- `supabase/migrations/2026052203_webhook_dlq.sql` — DLQ table schema
- `docs/runbooks/click-dlq.md` — similar DLQ pattern for click processing
