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
      // OF-11: Detect mid-cycle tier/plan changes
      const previousAttributes = (event.data as any).previous_attributes as Record<string, unknown> | undefined;
      const prevItems = previousAttributes?.items as { data?: Array<{ price?: { id?: string } }> } | undefined;
      const prevPriceId = prevItems?.data?.[0]?.price?.id;
      const newPriceId = subscription.items?.data?.[0]?.price?.id;
      const tierChanged = prevPriceId && newPriceId && prevPriceId !== newPriceId;

      if (tierChanged) {
        // Map new price ID back to tier name via env vars
        const newTier = Object.entries(process.env)
          .filter(([k]) => k.startsWith("STRIPE_PRICE_ID_"))
          .find(([, v]) => v === newPriceId)?.[0]
          ?.replace("STRIPE_PRICE_ID_", "")
          ?.toLowerCase() as "insider" | "pro" | undefined;

        return {
          op: "change_tier",
          stripe_subscription_id: subscription.id,
          status: mapStripeStatus(subscription.status),
          new_tier: newTier,
          current_period_start: toIsoOrUndefined(
            (subscription as any).current_period_start,
          ),
          current_period_end: toIsoOrUndefined(
            (subscription as any).current_period_end,
          ),
        };
      }

      return {
        op: "update_status",
        stripe_subscription_id: subscription.id,
        status: mapStripeStatus(subscription.status),
      };
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      return {
        op: "cancel_membership",
        stripe_subscription_id: subscription.id,
      };
    }


    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const customerId = typeof charge.customer === "string" ? charge.customer : undefined;
      return {
        op: "record_refund",
        stripe_customer_id: customerId,
        amount_refunded: charge.amount_refunded,
        currency: charge.currency,
        charge_id: charge.id,
      } as StripeEventOp;
    }

    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn": {
      const dispute = event.data.object as Stripe.Dispute;
      const chargeId = typeof dispute.charge === "string" ? dispute.charge : undefined;
      return {
        op: "record_dispute",
        charge_id: chargeId,
        dispute_id: dispute.id,
        status: dispute.status,
        amount: dispute.amount,
        currency: dispute.currency,
      } as StripeEventOp;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof (invoice as any).subscription === "string"
          ? (invoice as any).subscription as string
          : undefined;
      return {
        op: "payment_failed",
        stripe_subscription_id: subscriptionId,
        attempt_count: invoice.attempt_count ?? 0,
        next_payment_attempt: invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000).toISOString()
          : undefined,
      } as StripeEventOp;
    }

    default:
      logger.info(`Unhandled Stripe event type: ${event.type}`);
      return { op: "noop" };
  }
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
