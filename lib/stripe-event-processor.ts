import Stripe from "stripe";
import { logger } from "@/lib/logger";
import {
  createMembership,
  getMembershipByStripeSubscription,
  updateMembership,
} from "@/lib/dal/memberships";

export async function processStripeEvent(stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata;
      const customerId = session.customer as string;
      const subscriptionId = session.subscription as string;
      const siteId = metadata?.site_id;
      const tier = (metadata?.tier as "insider" | "pro") || "insider";

      if (customerId && siteId && subscriptionId) {
        const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
        const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
        const email = customer.email || session.customer_details?.email;

        if (email) {
          await createMembership({
            site_id: siteId,
            email,
            tier,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          });
          logger.info("Membership created via Stripe checkout", { email, siteId, tier });
        }
      }
      break;
    }
    case "invoice.paid": {
      const invoice = event.data.object as any;
      const subscriptionId = invoice.subscription as string;

      if (subscriptionId) {
        const membership = await getMembershipByStripeSubscription(subscriptionId);
        if (membership) {
          const sub = (await stripe.subscriptions.retrieve(subscriptionId)) as any;
          await updateMembership(membership.id, {
            status: "active",
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          });
          logger.info("Membership renewed", { email: membership.email });
        }
      }
      break;
    }
    case "customer.subscription.updated": {
      const subscription = event.data.object as any;
      const subscriptionId = subscription.id;
      const status = subscription.status;
      const customerId = subscription.customer as string;

      const membership = await getMembershipByStripeSubscription(subscriptionId);
      if (membership) {
        const mappedStatus = mapStripeStatus(status);
        const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;

        await updateMembership(membership.id, {
          status: mappedStatus,
          email: customer.email || membership.email,
          current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        });

        logger.info("Membership status updated", {
          email: customer.email || membership.email,
          status: mappedStatus,
        });
      }
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as any;
      const subscriptionId = subscription.id;

      const membership = await getMembershipByStripeSubscription(subscriptionId);
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

function mapStripeStatus(stripeStatus: string): "active" | "cancelled" | "expired" | "past_due" {
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
