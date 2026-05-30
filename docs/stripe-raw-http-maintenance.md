# Stripe Raw HTTP Integration — Maintenance Guide

## Why Raw HTTP Instead of the SDK

This codebase uses Stripe's raw HTTP API (via `lib/stripe-webhook.ts` and
`lib/stripe-event-processor.ts`) instead of the official `stripe` npm package.
This was a deliberate architectural decision:

- **Bundle size**: The Stripe SDK adds ~200KB+ to the Cloudflare Worker bundle.
  On Workers, every KB matters for cold-start latency.
- **Edge compatibility**: The SDK has historically assumed Node.js APIs (e.g.
  `http`, `net`) that are not available in the Cloudflare Workers runtime.
- **Minimal surface**: We only use webhook signature verification and a small
  set of event types — the SDK's 300+ endpoint wrappers are unused weight.

## Risks to Monitor

### 1. Stripe API Version Drift

Stripe makes backward-incompatible changes behind versioned APIs. Our webhook
processing assumes specific payload shapes for:

- `checkout.session.completed`
- `customer.subscription.created`, `.updated`, `.deleted`
- `invoice.payment_succeeded`, `.payment_failed`
- `charge.refunded`

**Action required**: When Stripe releases a new API version, review the
[Stripe changelog](https://stripe.com/docs/upgrades#api-versions) and verify
that the payload fields we access in `lib/stripe-event-processor.ts` have not
changed.

### 2. Signature Scheme Changes

We implement HMAC-SHA256 signature verification manually in
`lib/stripe-webhook.ts`. If Stripe changes the signing scheme (e.g. switches
to `v2` signatures), our verification will silently reject all webhooks.

**Mitigation**: Monitor the `Stripe-Signature` header format. The current
implementation parses `t=<timestamp>,v1=<hex>` — any new `v2` scheme would
need explicit support.

### 3. Webhook Replay Window

The default replay rejection window is 5 minutes (`DEFAULT_TOLERANCE_SECONDS`
in `lib/stripe-webhook.ts`). If Stripe's webhook delivery latency exceeds this
(e.g. during incidents), legitimate events will be rejected.

**Operational note**: Stripe's DLQ will retry, and our `webhook_dlq` table
captures failures for manual replay.

## Annual Review Checklist

- [ ] Check Stripe API changelog for breaking changes to event schemas we consume
- [ ] Verify signature scheme is still `v1` (HMAC-SHA256)
- [ ] Review `STRIPE_PRICE_MAP` env var matches current Stripe product/price IDs
- [ ] Confirm webhook endpoints are registered in Stripe dashboard
- [ ] Test webhook signature verification with `stripe trigger` CLI
- [ ] Review DLQ entries from the past quarter for systematic failures
