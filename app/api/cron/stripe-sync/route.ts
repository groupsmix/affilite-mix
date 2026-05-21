import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { getRecentStripeEventIds } from "@/lib/dal/stripe-events";
import { processStripeEvent } from "@/lib/stripe-event-processor";
import { getStripeClient } from "@/lib/stripe-client";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { logger } from "@/lib/logger";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { captureMessage } from "@/lib/sentry";

type MembershipMirrorRow = {
  id: string;
  site_id: string;
  status: string;
  tier: string | null;
  stripe_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
};

function subscriptionPeriodIso(
  subscription: Stripe.Subscription,
  field: "current_period_start" | "current_period_end",
): string | undefined {
  const seconds = (subscription as unknown as Record<typeof field, number | null | undefined>)[
    field
  ];
  return seconds ? new Date(seconds * 1000).toISOString() : undefined;
}

function sameInstant(dbValue: string | null, stripeValue: string | undefined): boolean {
  if (!dbValue && !stripeValue) return true;
  if (!dbValue || !stripeValue) return false;
  return new Date(dbValue).getTime() === new Date(stripeValue).getTime();
}

function expectedAppStatus(status: Stripe.Subscription.Status | string) {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "cancelled";
    case "incomplete_expired":
      return "expired";
    default:
      return "past_due";
  }
}

function hasActiveAccess(status: Stripe.Subscription.Status | string): boolean {
  return status === "active" || status === "trialing";
}

function resolveTierFromPriceId(priceId: string | undefined): "insider" | "pro" | undefined {
  if (!priceId) return undefined;
  const tiers: Array<"insider" | "pro"> = ["insider", "pro"];
  for (const tier of tiers) {
    const envKey = `STRIPE_PRICE_ID_${tier.toUpperCase()}`;
    if (process.env[envKey] === priceId) return tier;
  }
  return undefined;
}

function reconciliationEventId(
  reason: string,
  subscriptionId: string,
  discriminator: string,
): string {
  return `reconcile_${reason}_${subscriptionId}_${discriminator}`.replace(/[^a-zA-Z0-9_:-]/g, "_");
}

function alertStripeVariance(message: string, details: Record<string, unknown>) {
  logger.warn(message, details);
  captureMessage(`${message}: ${JSON.stringify(details)}`, "warning");
}

async function replaySubscriptionUpdated(
  stripe: Stripe,
  subscription: Stripe.Subscription,
  reason: string,
  discriminator: string,
): Promise<boolean> {
  const syntheticEvent = {
    id: reconciliationEventId(reason, subscription.id, discriminator),
    type: "customer.subscription.updated" as const,
    data: { object: subscription },
  } as unknown as Stripe.Event;

  const result = await processStripeEvent(stripe, syntheticEvent);
  return !result.duplicate;
}

async function replayInvoicePaid(
  stripe: Stripe,
  subscription: Stripe.Subscription,
): Promise<boolean> {
  const periodEnd = subscriptionPeriodIso(subscription, "current_period_end") ?? "unknown_period";
  const syntheticEvent = {
    id: reconciliationEventId("period", subscription.id, periodEnd),
    type: "invoice.paid" as const,
    data: { object: { subscription: subscription.id } },
  } as unknown as Stripe.Event;

  const result = await processStripeEvent(stripe, syntheticEvent);
  return !result.duplicate;
}

async function replaySubscriptionDeleted(
  stripe: Stripe,
  subscriptionId: string,
  reason: string,
  discriminator: string,
): Promise<boolean> {
  const syntheticEvent = {
    id: reconciliationEventId(reason, subscriptionId, discriminator),
    type: "customer.subscription.deleted" as const,
    data: { object: { id: subscriptionId } },
  } as unknown as Stripe.Event;

  const result = await processStripeEvent(stripe, syntheticEvent);
  return !result.duplicate;
}

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
    // Stripe remains the source of truth. All corrective mutations are routed
    // through processStripeEvent/apply_stripe_membership_event so the money
    // table update and audit_log row are written atomically by the same RPC.
    const sb = getPrivilegedSupabaseClient("cron.stripe-sync");
    const runDay = new Date().toISOString().slice(0, 10);
    let reconcileFixed = 0;
    let varianceCount = 0;
    const seenStripeSubscriptions = new Set<string>();

    for (const listStatus of ["active", "trialing"] as const) {
      for await (const stripeSub of stripe.subscriptions.list({ status: listStatus, limit: 100 })) {
        seenStripeSubscriptions.add(stripeSub.id);

        const { data: dbMembership, error: membershipError } = await (sb.from as any)("memberships")
          .select(
            "id, site_id, status, tier, stripe_subscription_id, current_period_start, current_period_end",
          )
          .eq("stripe_subscription_id", stripeSub.id)
          .unsafeNoSiteFilter()
          .maybeSingle();

        if (membershipError) throw membershipError;

        if (!dbMembership) {
          varianceCount++;
          alertStripeVariance("OF-08: Active Stripe subscription has no DB membership row", {
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
              id: reconciliationEventId("create", stripeSub.id, runDay),
              type: "checkout.session.completed" as const,
              data: { object: sessions.data[0] },
            } as unknown as Stripe.Event;
            const result = await processStripeEvent(stripe, syntheticEvent);
            if (!result.duplicate) reconcileFixed++;
          }
          continue;
        }

        const row = dbMembership as MembershipMirrorRow;
        const currentPriceId = stripeSub.items?.data?.[0]?.price?.id ?? undefined;
        const expectedTier = resolveTierFromPriceId(currentPriceId);
        const expectedPeriodStart = subscriptionPeriodIso(stripeSub, "current_period_start");
        const expectedPeriodEnd = subscriptionPeriodIso(stripeSub, "current_period_end");
        const statusMismatch = row.status !== "active";
        const tierMismatch = Boolean(expectedTier && row.tier !== expectedTier);
        const periodMismatch =
          !sameInstant(row.current_period_start, expectedPeriodStart) ||
          !sameInstant(row.current_period_end, expectedPeriodEnd);

        if (statusMismatch || tierMismatch) {
          varianceCount++;
          alertStripeVariance("OF-08: Correcting stale membership status/tier", {
            subscriptionId: stripeSub.id,
            dbStatus: row.status,
            expectedStatus: "active",
            dbTier: row.tier,
            expectedTier,
          });
          if (await replaySubscriptionUpdated(stripe, stripeSub, "status_tier", runDay)) {
            reconcileFixed++;
          }
        }

        if (periodMismatch) {
          varianceCount++;
          alertStripeVariance("OF-08: Correcting stale membership period boundaries", {
            subscriptionId: stripeSub.id,
            dbPeriodStart: row.current_period_start,
            expectedPeriodStart,
            dbPeriodEnd: row.current_period_end,
            expectedPeriodEnd,
          });
          if (await replayInvoicePaid(stripe, stripeSub)) {
            reconcileFixed++;
          }
        }
      }
    }

    const { data: activeMemberships, error: activeMembershipsError } = await (sb.from as any)(
      "memberships",
    )
      .select(
        "id, site_id, status, tier, stripe_subscription_id, current_period_start, current_period_end",
      )
      .eq("status", "active")
      .not("stripe_subscription_id", "is", null)
      .unsafeNoSiteFilter();

    if (activeMembershipsError) throw activeMembershipsError;

    for (const row of (activeMemberships ?? []) as MembershipMirrorRow[]) {
      const subscriptionId = row.stripe_subscription_id;
      if (!subscriptionId || seenStripeSubscriptions.has(subscriptionId)) continue;

      let stripeSub: Stripe.Subscription | null = null;
      try {
        stripeSub = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 404) {
          varianceCount++;
          alertStripeVariance("OF-08: DB active membership points to missing Stripe subscription", {
            membershipId: row.id,
            subscriptionId,
          });
          if (await replaySubscriptionDeleted(stripe, subscriptionId, "missing", runDay)) {
            reconcileFixed++;
          }
          continue;
        }
        throw err;
      }

      if (!hasActiveAccess(stripeSub.status)) {
        varianceCount++;
        alertStripeVariance("OF-08: DB active membership is not active in Stripe", {
          membershipId: row.id,
          subscriptionId,
          stripeStatus: stripeSub.status,
          expectedAppStatus: expectedAppStatus(stripeSub.status),
        });
        if (await replaySubscriptionUpdated(stripe, stripeSub, "inactive", runDay)) {
          reconcileFixed++;
        }
      }
    }

    void recordCronLiveness("stripe-sync");
    return NextResponse.json({ success: true, syncedCount, reconcileFixed, varianceCount });
  } catch (error) {
    logger.error("Stripe sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
