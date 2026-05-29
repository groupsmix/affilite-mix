import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { getRecentStripeEventIds } from "@/lib/dal/stripe-events";
import { processStripeEvent } from "@/lib/stripe-event-processor";
import { getStripeClient } from "@/lib/stripe-client";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { logger } from "@/lib/logger";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { untypedFrom } from "@/lib/dal/type-guards";

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
      const { data: dbMembership } = await untypedFrom(sb, "memberships")
        .select("id, status, tier")
        // F-API-01: lookup by stripe_subscription_id resolves which tenant
        // owns the membership — there is no site_id to filter on yet.
        .unsafeNoSiteFilter()
        .eq("stripe_subscription_id", stripeSub.id)
        .maybeSingle();

      if (!dbMembership) {
        logger.warn("OF-08: Active Stripe subscription has no DB membership row", {
          subscriptionId: stripeSub.id,
          customerId: typeof stripeSub.customer === "string" ? stripeSub.customer : undefined,
        });

        try {
          const { captureMessage } = await import("@/lib/sentry");
          captureMessage(
            `OF-08: Active Stripe subscription has no DB membership row: ${stripeSub.id}`,
            "warning",
          );
        } catch {
          // fail-open: best-effort [criticality:non-critical]
          // ignore if sentry is not available
        }

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
        try {
          const { captureMessage } = await import("@/lib/sentry");
          captureMessage(
            `OF-08: Correcting stale membership status for ${stripeSub.id} (was ${dbMembership.status})`,
            "warning",
          );
        } catch {
          // fail-open: best-effort [criticality:non-critical]
          // ignore if sentry is not available
        }
        await untypedFrom(sb, "memberships")
          .update({ status: "active", updated_at: new Date().toISOString() })
          // F-API-01: stripe_subscription_id is globally unique across tenants.
          .unsafeNoSiteFilter()
          .eq("stripe_subscription_id", stripeSub.id);
        reconcileFixed++;
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
