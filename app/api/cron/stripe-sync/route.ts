import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { getRecentStripeEventIds } from "@/lib/dal/stripe-events";
import { processStripeEvent } from "@/lib/stripe-event-processor";
import { getStripeClient } from "@/lib/stripe-client";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { logger } from "@/lib/logger";
import { recordCronLiveness } from "@/lib/cron-liveness";

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/stripe-sync"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return NextResponse.json({ error: "Stripe not configured" }, { status: 503 });
  }

  const stripe = await getStripeClient(stripeKey);
  const sb = getPrivilegedSupabaseClient();

  try {
    // --- Phase 1: Replay missed events from last 48 hours (existing behaviour) ---
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const processedEventIds = await getRecentStripeEventIds(fortyEightHoursAgo, getPrivilegedSupabaseClient);

    const stripeEvents = stripe.events.list({
      created: { gte: Math.floor(fortyEightHoursAgo.getTime() / 1000) },
      limit: 100,
    });

    let syncedCount = 0;
    for await (const event of stripeEvents) {
      if (!processedEventIds.has(event.id)) {
        logger.info("Syncing missed Stripe event", { id: event.id, type: event.type });
        const result = await processStripeEvent(stripe, event);
        if (!result.duplicate) syncedCount++;
      }
    }

    // --- Phase 2: OF-12 Full reconciliation — compare ALL active Stripe subscriptions ---
    // Fetch all active Stripe subscriptions (paginated)
    const stripeActiveSubIds = new Set<string>();
    for await (const sub of stripe.subscriptions.list({ status: "active", limit: 100 })) {
      stripeActiveSubIds.add(sub.id);
    }
    // Also include trialing
    for await (const sub of stripe.subscriptions.list({ status: "trialing", limit: 100 })) {
      stripeActiveSubIds.add(sub.id);
    }

    // Fetch all active memberships from DB
    // eslint-disable-next-line no-restricted-syntax -- privileged cron
    const { data: dbMemberships, error: dbErr } = await (sb.from as any)("memberships")
      .select("stripe_subscription_id, status, email, site_id")
      .not("stripe_subscription_id", "is", null);

    if (dbErr) {
      logger.error("Stripe reconciliation: failed to fetch memberships", { error: dbErr.message });
    } else {
      const dbActiveSubIds = new Set(
        (dbMemberships ?? [])
          .filter((m: any) => m.status === "active")
          .map((m: any) => m.stripe_subscription_id)
      );

      // Find Stripe-active subs missing or cancelled in DB
      let reconciled = 0;
      for (const subId of stripeActiveSubIds) {
        if (!dbActiveSubIds.has(subId)) {
          logger.warn("Stripe reconciliation: active Stripe subscription missing in DB", { subId });
          // Replay the subscription to re-sync
          try {
            const sub = await stripe.subscriptions.retrieve(subId);
            const fakeEvent = {
              id: `reconcile_${subId}_${Date.now()}`,
              type: "customer.subscription.updated",
              data: { object: sub },
            } as any;
            await processStripeEvent(stripe, fakeEvent);
            reconciled++;
          } catch (e) {
            logger.error("Stripe reconciliation: failed to replay subscription", {
              subId,
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }
      }

      // Find DB-active subs that Stripe says are not active
      for (const m of (dbMemberships ?? []) as any[]) {
        if (m.status === "active" && m.stripe_subscription_id && !stripeActiveSubIds.has(m.stripe_subscription_id)) {
          logger.warn("Stripe reconciliation: DB membership active but Stripe subscription not active", {
            stripe_subscription_id: m.stripe_subscription_id,
            email: m.email,
          });
          // Mark as past_due pending next webhook
          await (sb.from as any)("memberships")
            .update({ status: "past_due", updated_at: new Date().toISOString() })
            .eq("stripe_subscription_id", m.stripe_subscription_id);
          reconciled++;
        }
      }

      logger.info("Stripe reconciliation complete", {
        stripeActive: stripeActiveSubIds.size,
        dbActive: dbActiveSubIds.size,
        reconciled,
      });
    }

    void recordCronLiveness("stripe-sync");
    return NextResponse.json({ success: true, syncedCount });
  } catch (error) {
    logger.error("Stripe sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
