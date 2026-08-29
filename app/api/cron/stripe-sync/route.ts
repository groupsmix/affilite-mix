import { NextRequest, NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { getRecentStripeEventIds } from "@/lib/dal/stripe-events";
import { processStripeEvent } from "@/lib/stripe-event-processor";
import { getStripeClient } from "@/lib/stripe-client";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { untypedFrom } from "@/lib/dal/type-guards";
import { isReconcilableToActive, RECONCILABLE_TO_ACTIVE } from "@/lib/stripe-reconciliation-policy";

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
    let reconcileSkipped = 0;

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

      // Ensure status mirror is accurate, but only for transient billing drift.
      // F1: a dispute ("disputed") or full refund ("cancelled") does NOT cancel the
      // Stripe subscription, so it stays "active" here. Reactivating those would
      // silently undo a fraud/entitlement hold, so only transient billing states
      // (past_due / expired) are eligible for auto-correction. See
      // lib/stripe-reconciliation-policy.ts.
      if (dbMembership.status !== "active") {
        if (!isReconcilableToActive(dbMembership.status)) {
          logger.warn(
            "OF-08: active Stripe subscription vs protected membership status; NOT auto-reactivating",
            { subscriptionId: stripeSub.id, dbStatus: dbMembership.status },
          );
          try {
            const { captureMessage } = await import("@/lib/sentry");
            captureMessage(
              `OF-08: active Stripe sub ${stripeSub.id} but membership status is "${dbMembership.status}"; manual review required, not auto-reactivated`,
              "warning",
            );
          } catch {
            // fail-open: best-effort [criticality:non-critical]
            // ignore if sentry is not available
          }
          reconcileSkipped++;
          continue;
        }

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
          .eq("stripe_subscription_id", stripeSub.id)
          // F1 (TOCTOU fix): gate the write on the current status being a
          // reconcilable transient-billing state. isReconcilableToActive()
          // above is a non-atomic read-check; without this WHERE clause a
          // charge.dispute.created / charge.refunded webhook delivered
          // concurrently (flipping the row to disputed/cancelled through the
          // guarded RPC) would be silently overwritten back to "active" by
          // this bare UPDATE, bypassing the 2026062202 terminal-state guard.
          // Scoping the UPDATE to the reconcilable states makes the check and
          // the write a single atomic operation: if the row already moved to a
          // terminal state, zero rows match and the fraud hold is preserved.
          .in("status", Array.from(RECONCILABLE_TO_ACTIVE));
        reconcileFixed++;
      }
    }

    // ── Phase 3: Reverse reconciliation (Issue 4) ──────────────────────
    // Phase 2 only iterates ACTIVE Stripe subscriptions and ensures the DB
    // mirrors them. The reverse direction is unguarded: a DB membership whose
    // Stripe subscription was cancelled (e.g. directly in the Stripe dashboard,
    // or a webhook that never arrived) stays `active` forever — the user keeps
    // their paid entitlement with no matching billing.
    //
    // This pass walks every DB-active membership that has a Stripe sub id and
    // asks Stripe for the authoritative status. If Stripe says the sub is
    // terminal (canceled / incomplete_expired), the membership is deactivated.
    //
    // GATED behind STRIPE_REVERSE_RECONCILE_ENABLED=true (default off) because:
    //   - It makes one Stripe API call per active member per cron tick, which
    //     is billable volume that should be opted into deliberately.
    //   - A misconfigured/overlapping cancellation rule could mass-deactivate
    //     members; defaulting off lets an operator enable it after review.
    let reverseReconciled = 0;
    let reverseSkipped = 0;
    let reverseChecked = 0;
    if (process.env.STRIPE_REVERSE_RECONCILE_ENABLED === "true") {
      logger.info("STRIPE_REVERSE_RECONCILE_ENABLED=true — running reverse reconciliation pass");

      // Query DB-active memberships that have a Stripe subscription id. Use the
      // privileged client + unsafeNoSiteFilter(): the sub id is globally unique
      // and this is a cross-tenant billing-integrity sweep (mirrors Phase 2).
      const { data: activeMemberships, error: listError } = await untypedFrom(sb, "memberships")
        .select("id, site_id, email, stripe_subscription_id, status")
        // F-API-01: reverse reconciliation must consider every tenant's
        // memberships — a cancelled sub in any site is an entitlement leak.
        .unsafeNoSiteFilter()
        .eq("status", "active")
        .not("stripe_subscription_id", "is", null);

      if (listError) {
        logger.error("Reverse reconcile: failed to list active memberships", {
          error: listError.message,
        });
        // Non-fatal: the rest of the sync already succeeded. Do not 500.
        captureException(listError, { context: "[cron/stripe-sync] reverse-reconcile-list" });
      } else if (activeMemberships) {
        for (const m of activeMemberships as Array<{
          id: string;
          stripe_subscription_id: string;
        }>) {
          reverseChecked++;
          try {
            const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
            // Only terminal, non-resurrectable states deactivate a membership.
            // A transient state (past_due, unpaid) is left alone here — Phase 2
            // / webhook handling manages reactivation vs. dunning for those.
            if (sub.status === "canceled" || sub.status === "incomplete_expired") {
              await untypedFrom(sb, "memberships")
                .update(
                  {
                    status: "cancelled",
                    cancelled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                  },
                  // F-API-01: stripe_subscription_id is globally unique across tenants.
                )
                .unsafeNoSiteFilter()
                .eq("id", m.id);
              reverseReconciled++;
              logger.warn("Reverse reconcile: deactivated membership — Stripe sub is terminal", {
                membershipId: m.id,
                stripeSubscriptionId: m.stripe_subscription_id,
                stripeStatus: sub.status,
              });
            }
          } catch (retrieveErr) {
            // NEVER deactivate without a confirmed Stripe response. A retrieve
            // failure (network blip, transient 5xx, rate limit) must skip the
            // row, not assume cancellation. Log and move on.
            reverseSkipped++;
            logger.warn("Reverse reconcile: Stripe retrieve failed — skipping (NOT deactivating)", {
              membershipId: m.id,
              stripeSubscriptionId: m.stripe_subscription_id,
              error: retrieveErr instanceof Error ? retrieveErr.message : String(retrieveErr),
            });
          }
        }
        logger.info("Reverse reconcile pass complete", {
          reverseChecked,
          reverseReconciled,
          reverseSkipped,
        });
      }
    }

    void recordCronLiveness("stripe-sync");
    return NextResponse.json({
      success: true,
      syncedCount,
      reconcileFixed,
      reconcileSkipped,
      // Phase 3 metrics — always present so callers/monitors see zeros when the
      // pass is disabled, not a missing key.
      reverseChecked,
      reverseReconciled,
      reverseSkipped,
    });
  } catch (error) {
    captureException(error, { context: "[cron/stripe-sync] failed" });
    logger.error("Stripe sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
