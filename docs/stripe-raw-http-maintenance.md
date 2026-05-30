# Stripe Integration — Maintenance Guide

## Architecture: SDK + Raw HTTP Hybrid

This codebase uses a **hybrid approach** for Stripe:

- **Stripe SDK (`stripe` npm package)**: Used for checkout session creation,
  subscription management, and typed event processing via `lib/stripe-client.ts`.
  The SDK is lazy-loaded (dynamic import) to minimize cold-start impact.
- **Raw HTTP (`lib/stripe-webhook.ts`)**: Used exclusively for webhook signature
  verification (HMAC-SHA256). This avoids importing the full SDK on the hot path
  for incoming webhook requests.

### Why the hybrid approach

- **Bundle size**: The Stripe SDK (~250KB) is deferred via dynamic import so it
  only loads when needed (checkout, subscription ops) — not on every request.
- **Webhook hot path**: Signature verification uses Web Crypto directly
  (`lib/stripe-webhook.ts`) to avoid loading the SDK for every webhook delivery.
- **SDK for typed operations**: Checkout, subscription, and invoice operations
  use the typed SDK for safety and forward compatibility.

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
