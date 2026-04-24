import { NextRequest, NextResponse } from "next/server";
import {
  createMembership,
  getMembershipByStripeSubscription,
  updateMembership,
} from "@/lib/dal/memberships";
import { recordStripeEvent } from "@/lib/dal/stripe-events";
import { logger } from "@/lib/logger";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    logger.error("Stripe webhook: missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const stripe = new Stripe(stripeKey, {
    apiVersion: "2024-12-18.acacia",
    appInfo: { name: "affilite-mix" },
    httpClient: Stripe.createFetchHttpClient(),
  });

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (err) {
    logger.warn("Stripe webhook signature verification failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let firstDelivery: boolean;
  try {
    firstDelivery = await recordStripeEvent(event.id, event.type);
  } catch (err) {
    logger.error("Stripe webhook: failed to record event id", {
      id: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Idempotency store unavailable" }, { status: 500 });
  }

  if (!firstDelivery) {
    logger.info("Stripe webhook: skipping duplicate event", { id: event.id, type: event.type });
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const metadata = session.metadata;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const siteId = metadata?.site_id;
        const tier = (metadata?.tier as "insider" | "pro") || "insider";

        if (customerId && siteId && subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
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
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const membership = await getMembershipByStripeSubscription(subscriptionId);
          if (membership) {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
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
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;
        const status = subscription.status;
        const customerId = subscription.customer as string;

        const membership = await getMembershipByStripeSubscription(subscriptionId);
        if (membership) {
          const mappedStatus = mapStripeStatus(status);
          const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;

          await updateMembership(membership.id, {
            status: mappedStatus,
            email: customer.email || membership.email, // Sync email changes
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
        const subscription = event.data.object as Stripe.Subscription;
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

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("Stripe webhook processing failed", {
      type: event.type,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
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
