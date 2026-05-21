export const runtime = "edge";

import { NextRequest, NextResponse } from "next/server";
import { processStripeEvent } from "@/lib/stripe-event-processor";
import { logger } from "@/lib/logger";
import { constructStripeEvent, prewarmStripeWebhookKey } from "@/lib/stripe-webhook";
import { getStripeClient } from "@/lib/stripe-client";

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
    return { parse_error: true };
  }
}

interface R2BucketLike {
  put(key: string, value: string | ReadableStream | ArrayBuffer): Promise<unknown>;
}

function getRateLimitKv(): any {
  const env = process.env as Record<string, unknown>;
  if (env.RATE_LIMIT_KV && typeof env.RATE_LIMIT_KV === "object") {
    return env.RATE_LIMIT_KV;
  }
  const globalEnv = globalThis as Record<string, any>;
  if (globalEnv.RATE_LIMIT_KV && typeof globalEnv.RATE_LIMIT_KV === "object") {
    return globalEnv.RATE_LIMIT_KV;
  }
  return null;
}

function getStripeWebhookDlqBucket(): R2BucketLike | null {
  const env = process.env as Record<string, unknown>;
  const bucket = env.STRIPE_WEBHOOK_DLQ_BUCKET ?? env.AUDIT_DLQ_BUCKET;
  if (bucket && typeof bucket === "object" && typeof (bucket as R2BucketLike).put === "function") {
    return bucket as R2BucketLike;
  }
  return null;
}

async function writeStripeWebhookDlq(
  event: { id?: string; type?: string },
  rawBody: string,
  error: unknown,
): Promise<boolean> {
  const payload = {
    ts: new Date().toISOString(),
    event_id: event.id,
    event_type: event.type,
    error: error instanceof Error ? { name: error.name, message: error.message } : String(error),
    payload: redactStripePayloadForLogs(rawBody),
  };

  const bucket = getStripeWebhookDlqBucket();
  if (bucket) {
    const day = payload.ts.slice(0, 10);
    const id = event.id ?? `unknown-${crypto.randomUUID()}`;
    await bucket.put(`dlq/stripe-webhooks/${day}/${id}.ndjson`, `${JSON.stringify(payload)}\n`);
    return true;
  }

  const kv = getRateLimitKv();
  if (kv && typeof kv.put === "function") {
    const id = event.id ?? `unknown-${crypto.randomUUID()}`;
    await kv.put(`stripe-webhook-dlq:${id}`, JSON.stringify(payload), {
      expirationTtl: 86400 * 14,
    });
    return true;
  }

  return false;
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

  let event: any;
  try {
    event = await constructStripeEvent(rawBody, signature, webhookSecret);
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
      logger.error("Stripe webhook max retries reached, writing DLQ and acking", { id: event.id });
      let dlqWritten = false;
      try {
        dlqWritten = await writeStripeWebhookDlq(event, rawBody, err);
      } catch (dlqError) {
        logger.error("Stripe webhook DLQ write failed", {
          id: event.id,
          error: dlqError instanceof Error ? dlqError.message : String(dlqError),
        });
      }

      if (!dlqWritten) {
        logger.error("Stripe webhook DLQ unavailable; logging redacted payload only", {
          id: event.id,
          payload: redactStripePayloadForLogs(rawBody),
        });
      }

      return NextResponse.json({ received: true, dlq: true, dlqWritten });
    }

    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
