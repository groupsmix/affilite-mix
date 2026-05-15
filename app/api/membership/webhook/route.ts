export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { processStripeEvent } from "@/lib/stripe-event-processor";
import { logger } from "@/lib/logger";
import { constructStripeEvent, prewarmStripeWebhookKey } from "@/lib/stripe-webhook";
import { getStripeClient } from "@/lib/stripe-client";

// FIX-13 (F-004): Pre-warm the HMAC crypto key on cold start so the first
// webhook verification doesn't pay the importKey() latency penalty.
let _prewarmed = false;

export async function POST(request: NextRequest) {
  // F-FE-01: Fail fast if critical env vars are missing in edge runtime.
  // Checked at request time (not module load) to avoid build-time failures.
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    logger.error("Stripe webhook: missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // FIX-13: Pre-warm on first invocation per isolate
  if (!_prewarmed) {
    _prewarmed = true;
    await prewarmStripeWebhookKey(webhookSecret);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: any;
  try {
    // F-009: Use lightweight Web Crypto verifier instead of full Stripe SDK
    // to avoid edge runtime bloat/incompatibility.
    event = await constructStripeEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    // SEC-09: Include security headers on error responses to prevent
    // MIME-type sniffing attacks on the JSON error body.
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400, headers: { "X-Content-Type-Options": "nosniff" } },
    );
  }

  try {
    // G-18: Reuse a module-scope Stripe client across requests in the
    // same isolate. The first call lazily imports the SDK; subsequent
    // calls skip both the import and the constructor.
    const stripe = await getStripeClient(stripeKey);

    // LIVE-10 / F-024: idempotency record + membership side effect run
    // in a single Postgres transaction inside `processStripeEvent`. A
    // crash here rolls the event row back so Stripe will retry.
    const result = await processStripeEvent(stripe, event);

    if (result.duplicate) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("Stripe webhook processing failed", {
      id: event.id,
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });

    // F-API-08: Ack the event with a 200 after N failed attempts to prevent
    // an infinite retry loop hitting the Stripe account's rate limits.
    let attempts = 1;
    try {
      const kv = (process.env as any).RATE_LIMIT_KV as any;
      if (kv) {
        const attemptKey = `webhook-attempt:${event.id}`;
        attempts = parseInt((await kv.get(attemptKey)) || "0", 10) + 1;
        await kv.put(attemptKey, attempts.toString(), { expirationTtl: 86400 * 4 });
      }
    } catch (e) {}

    if (attempts >= 3) {
      logger.error("Stripe webhook max retries reached, acking to stop loop", { id: event.id });
      // Persist the raw payload to the observability sink (Logpush to R2)
      // so it can be replayed later.
      logger.error("Stripe webhook DLQ payload", { id: event.id, payload: rawBody });
      return NextResponse.json({ received: true, dlq: true });
    }

    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
