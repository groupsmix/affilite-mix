export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { recordStripeEvent } from "@/lib/dal/stripe-events";
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

  // F-024: The idempotency check (recordStripeEvent) and the side-effect (processStripeEvent)
  // are currently separate calls. While `recordStripeEvent` uses a unique constraint to prevent
  // concurrent double-processing, a crash during `processStripeEvent` would leave the event marked
  // as processed without the side-effects applied, and Stripe retries would be ignored.
  // We accept this limitation for now as Stripe events can be manually reconciled from the dashboard,
  // but true atomic processing requires moving the event recording into the same Postgres transaction
  // as the membership updates via an RPC call.

  let firstDelivery: boolean;
  try {
    firstDelivery = await recordStripeEvent(event.id, event.type);
  } catch (err) {
    logger.error("Stripe webhook: failed to record event id", {
      id: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Idempotency store unavailable" }, { status: 500 });
  }

  if (!firstDelivery) {
    logger.info("Stripe webhook: skipping duplicate event", { id: event.id, type: event.type });
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    // Only import the heavy Stripe SDK when processing is actually needed
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(stripeKey, {
      apiVersion: null as any,
      appInfo: { name: "affilite-mix" },
      httpClient: Stripe.createFetchHttpClient(),
    });

    await processStripeEvent(stripe, event);
    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("Stripe webhook processing failed", {
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
