export const runtime = "edge";

// F-FE-01: Fail fast if critical env vars are missing in edge runtime
if (
  typeof process !== "undefined" &&
  process.env?.NODE_ENV === "production" &&
  !process.env.STRIPE_WEBHOOK_SECRET
) {
  throw new Error(
    "STRIPE_WEBHOOK_SECRET missing for edge runtime — /api/membership/webhook cannot verify signatures",
  );
}

import { NextRequest, NextResponse } from "next/server";
import { processStripeEvent } from "@/lib/stripe-event-processor";
import { logger } from "@/lib/logger";
import { constructStripeEvent } from "@/lib/stripe-webhook";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    logger.error("Stripe webhook: missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
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
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    // Only import the heavy Stripe SDK when processing is actually needed.
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, {
      apiVersion: null as any,
      appInfo: { name: "affilite-mix" },
      httpClient: Stripe.createFetchHttpClient(),
    });

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
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
