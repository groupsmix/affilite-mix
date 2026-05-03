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

  try {
    // ── Phase 1: Event replay (last 48 h) ─────────────────────────────────
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const processedEventIds = await getRecentStripeEventIds(
      fortyEightHoursAgo,
      getPrivilegedSupabaseClient,
    );

    const stripeEvents = stripe.events.list({
      created: { gte: Math.floor(fortyEightHoursAgo.getTime() / 1000) },
      limit: 100,
    });

    let syncedCount = 0;

    for await (const event of stripeEvents) {
      if (!processedEventIds.has(event.id)) {
        logger.info("Syncing missed Stripe event", { id: event.id, type: event.type });
        const result = await processStripeEvent(stripe, event);
        if (!result.duplicate) {
          syncedCount++;
        }
      }
    }

    // ── Phase 2: OF-08 Full subscription reconciliation ───────────────────
    // Pull every active Stripe subscription and compare against DB memberships.
    // This catches gaps that fall outside the 48-hour event window (e.g. the
    // cron was down for days, or a webhook was never delivered).
    const sb = getPrivilegedSupabaseClient();
    let reconcileFixed = 0;

    for await (const stripeSub of stripe.subscriptions.list({ status: "active", limit: 100 })) {
      const { data: dbMembership } = await (sb.from as any)("memberships")
        .select("id, status, tier")
        .eq("stripe_subscription_id", stripeSub.id)
        .maybeSingle();

      if (!dbMembership) {
        logger.warn("OF-08: Active Stripe subscription has no DB membership row", {
          subscriptionId: stripeSub.id,
          customerId: typeof stripeSub.customer === "string" ? stripeSub.customer : undefined,
        });
        // Replay checkout.session.completed for this subscription to create the row.
        const sessions = await stripe.checkout.sessions.list({
          subscription: stripeSub.id,
          limit: 1,
        });
        if (sessions.data.length > 0) {
          const syntheticEvent = {
            id: `reconcile_${stripeSub.id}`,
            type: "checkout.session.completed" as const,
            data: { object: sessions.data[0] },
          } as unknown as import("stripe").Stripe.Event;
          const result = await processStripeEvent(stripe, syntheticEvent);
          if (!result.duplicate) reconcileFixed++;
        }
        continue;
      }

      // Ensure status mirror is accurate.
      if (dbMembership.status !== "active") {
        logger.info("OF-08: Correcting stale membership status", {
          subscriptionId: stripeSub.id,
          dbStatus: dbMembership.status,
        });
        await (sb.from as any)("memberships")
          .update({ status: "active", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", stripeSub.id);
        reconcileFixed++;
      }
    }

    // ── Phase 3: Cancelled/expired subscription reconciliation ──────────
    // Check for DB memberships that are still "active" but whose Stripe
    // subscription is actually cancelled, past_due, or otherwise inactive.
    // This catches cases where a cancellation webhook was missed entirely.
    const { data: activeDbMemberships } = await (sb.from as any)("memberships")
      .select("id, stripe_subscription_id, status")
      .eq("status", "active")
      .not("stripe_subscription_id", "is", null);

    if (activeDbMemberships && activeDbMemberships.length > 0) {
      for (const dbRow of activeDbMemberships as Array<{
        id: string;
        stripe_subscription_id: string;
        status: string;
      }>) {
        if (!dbRow.stripe_subscription_id) continue;
        try {
          const stripeSub = await stripe.subscriptions.retrieve(dbRow.stripe_subscription_id);
          const stripeStatus = stripeSub.status;

          // If Stripe says the subscription is no longer active, update DB.
          if (stripeStatus === "canceled" || stripeStatus === "unpaid") {
            logger.info("OF-08: Cancelling stale active membership (Stripe sub is cancelled)", {
              membershipId: dbRow.id,
              subscriptionId: dbRow.stripe_subscription_id,
              stripeStatus,
            });
            await (sb.from as any)("memberships")
              .update({
                status: "cancelled",
                cancelled_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", dbRow.id);
            reconcileFixed++;
          } else if (stripeStatus === "past_due" || stripeStatus === "incomplete") {
            logger.info("OF-08: Marking membership past_due (Stripe sub is past_due)", {
              membershipId: dbRow.id,
              subscriptionId: dbRow.stripe_subscription_id,
              stripeStatus,
            });
            await (sb.from as any)("memberships")
              .update({
                status: "past_due",
                updated_at: new Date().toISOString(),
              })
              .eq("id", dbRow.id);
            reconcileFixed++;
          } else if (stripeStatus === "incomplete_expired") {
            logger.info("OF-08: Marking membership expired (Stripe sub is incomplete_expired)", {
              membershipId: dbRow.id,
              subscriptionId: dbRow.stripe_subscription_id,
            });
            await (sb.from as any)("memberships")
              .update({
                status: "expired",
                updated_at: new Date().toISOString(),
              })
              .eq("id", dbRow.id);
            reconcileFixed++;
          }
        } catch (subError) {
          // Subscription may have been deleted from Stripe entirely.
          logger.warn("OF-08: Could not retrieve Stripe subscription for reconciliation", {
            membershipId: dbRow.id,
            subscriptionId: dbRow.stripe_subscription_id,
            error: subError instanceof Error ? subError.message : String(subError),
          });
        }
      }
    }

    void recordCronLiveness("stripe-sync");
    return NextResponse.json({ success: true, syncedCount, reconcileFixed });
  } catch (error) {
    logger.error("Stripe sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
