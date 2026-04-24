import type Stripe from "stripe";
import {
  createMembership,
  getMembershipByStripeSubscription,
  updateMembership,
} from "@/lib/dal/memberships";
import { logger } from "@/lib/logger";

/**
 * Process a verified Stripe webhook event.
 *
 * Extracted from app/api/membership/webhook/route.ts so the signature
 * verification / idempotency layer stays thin and the side-effectful
 * business logic can be unit-tested independently.
 *
 * Handled event types:
 *  - checkout.session.completed
 *  - invoice.paid
 *  - customer.subscription.updated
 *  - customer.subscription.deleted
 *
 * Any other event type is logged and ignored (the route still returns 2xx
 * so Stripe does not retry).
 */
export async function processStripeEvent(stripe: Stripe, event: Stripe.Event): Promise<void> {
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

      if (email && siteId && subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId);

        await createMembership({
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
        });

        logger.info("Membership created via Stripe checkout", { email, siteId, tier });
      }
      break;
    }

    case "invoice.paid": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId =
        typeof (invoice as unknown as { subscription?: string | Stripe.Subscription | null })
          .subscription === "string"
          ? ((invoice as unknown as { subscription: string }).subscription as string)
          : undefined;

      if (subscriptionId) {
        const membership = await getMembershipByStripeSubscription(subscriptionId);
        if (membership) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);

          await updateMembership(membership.id, {
            status: "active",
            current_period_start: toIsoOrUndefined(
              (sub as unknown as { current_period_start?: number | null }).current_period_start,
            ),
            current_period_end: toIsoOrUndefined(
              (sub as unknown as { current_period_end?: number | null }).current_period_end,
            ),
          });
          logger.info("Membership renewed", { email: membership.email });
        }
      }
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const membership = await getMembershipByStripeSubscription(subscription.id);
      if (membership) {
        const mappedStatus = mapStripeStatus(subscription.status);
        await updateMembership(membership.id, { status: mappedStatus });
        logger.info("Membership status updated", {
          email: membership.email,
          status: mappedStatus,
        });
      }
      break;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const membership = await getMembershipByStripeSubscription(subscription.id);
      if (membership) {
        await updateMembership(membership.id, {
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
        });
        logger.info("Membership cancelled", { email: membership.email });
      }
      break;
    }

    default:
      logger.info(`Unhandled Stripe event type: ${event.type}`);
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
    default:
      return "active";
  }
}
