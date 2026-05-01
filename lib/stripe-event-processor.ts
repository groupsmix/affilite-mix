import type Stripe from "stripe";
import { applyStripeEventAtomic, type StripeEventOp } from "@/lib/dal/stripe-events";
import { logger } from "@/lib/logger";

/**
 * Result returned to the webhook / cron caller after processing a
 * verified Stripe event.
 */
export interface StripeProcessingResult {
  /** True when the event was already recorded (and therefore skipped). */
  duplicate: boolean;
  /** Membership row touched by the side effect, if any. */
  membershipId: string | null;
}

/**
 * Process a verified Stripe webhook event.
 *
 * Extracted from app/api/membership/webhook/route.ts so the signature
 * verification / idempotency layer stays thin and the side-effectful
 * business logic can be unit-tested independently.
 *
 * LIVE-10 / F-024: the previous implementation recorded the event id
 * via `recordStripeEvent` and then mutated `memberships` in separate
 * Supabase queries. A crash between the two steps left the event
 * marked processed without the side effect applied, and Stripe
 * retries skipped the event as a duplicate — silently dropping
 * subscription updates.
 *
 * The current implementation:
 *   1. Resolves any extra data needed from the Stripe API (e.g.
 *      `subscriptions.retrieve` for current_period_*).
 *   2. Builds a `StripeEventOp` payload describing the side effect.
 *   3. Calls the `apply_stripe_membership_event` Postgres RPC, which
 *      records the event id and applies the side effect inside a
 *      single transaction. If the side effect raises, the event row
 *      is rolled back and Stripe will retry.
 *
 * Handled event types:
 *  - checkout.session.completed
 *  - invoice.paid
 *  - customer.subscription.updated
 *  - customer.subscription.deleted
 *
 * Any other event type is logged and recorded as a no-op (the route
 * still returns 2xx so Stripe does not retry).
 */
export async function processStripeEvent(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<StripeProcessingResult> {
  const payload = await buildStripeEventPayload(stripe, event);

  const result = await applyStripeEventAtomic(event.id, event.type, payload);

  if (result.duplicate) {
    logger.info("Stripe event already processed, skipping", {
      id: event.id,
      type: event.type,
    });
  } else {
    logStripeSideEffect(event.type, payload, result.membership_id);
  }

  return { duplicate: result.duplicate, membershipId: result.membership_id };
}

async function buildStripeEventPayload(
  stripe: Stripe,
  event: Stripe.Event,
): Promise<StripeEventOp> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = (session.metadata ?? undefined) as Record<string, string> | undefined;
      const email = session.customer_email ?? undefined;
      const customerId = typeof session.customer === "string" ? session.customer : undefined;
      const subscriptionId =
        typeof session.subscription === "string" ? session.subscription : undefined;
      const siteId = metadata?.site_id;
      const tier = (metadata?.tier as "insider" | "pro") || "insider";

      if (!email || !siteId || !subscriptionId) {
        // Not enough data to attach a membership; record the event so
        // Stripe stops retrying but skip the side effect.
        return { op: "noop" };
      }

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      return {
        op: "create_membership",
        site_id: siteId,
        email,
        tier,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        current_period_start: toIsoOrUndefined(
          (sub as unknown as { current_period_start?: number | null }).current_period_start,
        ),
        current_period_end: toIsoOrUndefined(
          (sub as unknown as { current_period_end?: number | null }).current_period_end,
        ),
      };
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof (invoice as unknown as { subscription?: string | Stripe.Subscription | null })
          .subscription === "string"
          ? ((invoice as unknown as { subscription: string }).subscription as string)
          : undefined;

      if (!subscriptionId) {
        return { op: "noop" };
      }

      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      return {
        op: "renew_membership",
        stripe_subscription_id: subscriptionId,
        current_period_start: toIsoOrUndefined(
          (sub as unknown as { current_period_start?: number | null }).current_period_start,
        ),
        current_period_end: toIsoOrUndefined(
          (sub as unknown as { current_period_end?: number | null }).current_period_end,
        ),
      };
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      // OF-07: Resolve the current price to detect mid-cycle tier changes.
      const currentPriceId =
        subscription.items?.data?.[0]?.price?.id ?? undefined;
      const newTier = currentPriceId ? resolveTierFromPriceId(currentPriceId) : undefined;
      return {
        op: "update_status",
        stripe_subscription_id: subscription.id,
        status: mapStripeStatus(subscription.status),
        tier: newTier,
      };
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      return {
        op: "cancel_membership",
        stripe_subscription_id: subscription.id,
      };
    }

    // OF-06: Handle refund, dispute, and failed-payment events so they are
    // not silently dropped. These events are recorded as membership status
    // updates rather than noop so the DB mirror stays accurate.
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : undefined;
      logger.info("Stripe charge refunded", { chargeId: charge.id, paymentIntentId });
      return { op: "noop" };
    }

    case "charge.dispute.created":
    case "charge.dispute.updated": {
      const dispute = event.data.object as Stripe.Dispute;
      logger.warn("Stripe dispute received — manual review required", {
        disputeId: dispute.id,
        status: dispute.status,
        amount: dispute.amount,
        currency: dispute.currency,
      });
      return { op: "noop" };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof (invoice as unknown as { subscription?: string | Stripe.Subscription | null })
          .subscription === "string"
          ? ((invoice as unknown as { subscription: string }).subscription as string)
          : undefined;
      if (!subscriptionId) return { op: "noop" };
      return {
        op: "update_status",
        stripe_subscription_id: subscriptionId,
        status: "past_due",
      };
    }

    case "customer.subscription.paused": {
      const subscription = event.data.object as Stripe.Subscription;
      return {
        op: "update_status",
        stripe_subscription_id: subscription.id,
        status: "past_due",
      };
    }

    default:
      logger.info(`Unhandled Stripe event type: ${event.type}`);
      return { op: "noop" };
  }
}

/**
 * OF-07: Resolve a membership tier from a Stripe price ID.
 * Checks STRIPE_PRICE_ID_<TIER> environment variables.
 */
function resolveTierFromPriceId(priceId: string): "insider" | "pro" | undefined {
  const tiers: Array<"insider" | "pro"> = ["insider", "pro"];
  for (const tier of tiers) {
    const envKey = `STRIPE_PRICE_ID_${tier.toUpperCase()}`;
    if (process.env[envKey] === priceId) return tier;
  }
  return undefined;
}

function logStripeSideEffect(
  eventType: string,
  payload: StripeEventOp,
  membershipId: string | null,
): void {
  switch (payload.op) {
    case "create_membership":
      logger.info("Membership created via Stripe checkout", {
        email: payload.email,
        siteId: payload.site_id,
        tier: payload.tier,
        membershipId,
      });
      break;
    case "renew_membership":
      logger.info("Membership renewed", {
        stripeSubscriptionId: payload.stripe_subscription_id,
        membershipId,
      });
      break;
    case "update_status":
      logger.info("Membership status updated", {
        stripeSubscriptionId: payload.stripe_subscription_id,
        status: payload.status,
        membershipId,
      });
      break;
    case "cancel_membership":
      logger.info("Membership cancelled", {
        stripeSubscriptionId: payload.stripe_subscription_id,
        membershipId,
      });
      break;
    case "noop":
      logger.info("Stripe event recorded with no membership side effect", {
        type: eventType,
      });
      break;
  }
}

function toIsoOrUndefined(unixSeconds: number | null | undefined): string | undefined {
  if (!unixSeconds) return undefined;
  return new Date(unixSeconds * 1000).toISOString();
}

function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status | string,
): "active" | "cancelled" | "expired" | "past_due" {
  switch (stripeStatus) {
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
    // `incomplete` (initial payment not yet succeeded) and `paused`
    // are treated as past_due so the membership stays gated until a
    // subsequent webhook clarifies the state.
    default:
      return "past_due";
  }
}
