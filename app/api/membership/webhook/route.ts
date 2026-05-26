import { NextRequest, NextResponse } from "next/server";
import { processStripeEvent } from "@/lib/stripe-event-processor";
import { logger } from "@/lib/logger";
import { constructStripeEvent, prewarmStripeWebhookKey } from "@/lib/stripe-webhook";
import { getRuntimeEnv, type CloudflareKVBinding } from "@/lib/runtime-env";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe-client";
import { writeToDlq } from "@/lib/dal/webhook-dlq";

let _prewarmed = false;

function redactStripePayloadForLogs(rawBody: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawBody) as {
      id?: string;
      type?: string;
      created?: number;
      livemode?: boolean;
      data?: { object?: { id?: string; object?: string } };
    };

    return {
      id: parsed.id,
      type: parsed.type,
      created: parsed.created,
      livemode: parsed.livemode,
      object_id: parsed.data?.object?.id,
      object_type: parsed.data?.object?.object,
    };
  } catch {
    // fail-open: best-effort
    return { parse_error: true };
  }
}

function getRateLimitKv(): CloudflareKVBinding | null {
  const kv = getRuntimeEnv().RATE_LIMIT_KV;
  if (kv && typeof kv === "object" && "get" in kv && "put" in kv) {
    return kv;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    logger.error("Stripe webhook: missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  if (!_prewarmed) {
    _prewarmed = true;
    await prewarmStripeWebhookKey(webhookSecret);
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  // constructStripeEvent returns our lightweight StripeEvent; processStripeEvent
  // needs the Stripe SDK Event type — the cast is safe because the JSON shape
  // is identical (id, type, data.object) and Stripe's SDK type is a superset.
  let event: Stripe.Event;
  try {
    event = (await constructStripeEvent(
      rawBody,
      signature,
      webhookSecret,
    )) as unknown as Stripe.Event;
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400, headers: { "X-Content-Type-Options": "nosniff" } },
    );
  }

  try {
    const stripe = await getStripeClient(stripeKey);
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

    let attempts = 1;
    try {
      const kv = getRateLimitKv();
      if (kv && typeof kv.get === "function" && typeof kv.put === "function") {
        const attemptKey = `webhook-attempt:${event.id}`;
        attempts = parseInt((await kv.get(attemptKey)) || "0", 10) + 1;
        await kv.put(attemptKey, attempts.toString(), { expirationTtl: 86400 * 4 });
      } else {
        logger.warn("Stripe webhook retry KV binding unavailable; defaulting attempts to 1", {
          id: event.id,
        });
      }
    } catch (kvError) {
      logger.warn("Stripe webhook retry counter update failed", {
        id: event.id,
        error: kvError instanceof Error ? kvError.message : String(kvError),
      });
    }

    if (attempts >= 3) {
      logger.error("Stripe webhook max retries reached, acking to stop loop", { id: event.id });
      // R2-01: Write to durable DLQ table. If DLQ write fails, do NOT ACK —
      // return 500 so Stripe retries, preserving the event until persistence succeeds.
      try {
        await writeToDlq({
          event_id: event.id,
          event_type: event.type,
          payload: redactStripePayloadForLogs(rawBody),
          error_message: err instanceof Error ? err.message : String(err),
          attempts,
        });
      } catch (dlqErr) {
        logger.error("DLQ persistence failed — refusing to ACK webhook", {
          id: event.id,
          dlqError: dlqErr instanceof Error ? dlqErr.message : String(dlqErr),
        });
        return NextResponse.json({ error: "DLQ persistence failed" }, { status: 500 });
      }
      return NextResponse.json({ received: true, dlq: true });
    }

    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
