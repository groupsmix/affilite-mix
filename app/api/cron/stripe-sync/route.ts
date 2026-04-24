import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getRecentStripeEventIds, recordStripeEvent } from "@/lib/dal/stripe-events";
import { processStripeEvent } from "@/lib/stripe-event-processor";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, { secretEnvVars: ["CRON_STRIPE_SYNC_SECRET", "CRON_SECRET"] })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: null as any,
    appInfo: { name: "affilite-mix" },
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const processedEventIds = await getRecentStripeEventIds(fortyEightHoursAgo);

    const stripeEvents = stripe.events.list({
      created: { gte: Math.floor(fortyEightHoursAgo.getTime() / 1000) },
      limit: 100,
    });

    let syncedCount = 0;

    for await (const event of stripeEvents) {
      if (!processedEventIds.has(event.id)) {
        logger.info("Syncing missed Stripe event", { id: event.id, type: event.type });

        const isFirstDelivery = await recordStripeEvent(event.id, event.type);
        if (isFirstDelivery) {
          await processStripeEvent(stripe, event);
          syncedCount++;
        }
      }
    }

    return NextResponse.json({ success: true, syncedCount });
  } catch (error) {
    logger.error("Stripe sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
