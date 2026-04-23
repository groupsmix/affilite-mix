import { NextRequest, NextResponse } from "next/server";
import {
  createMembership,
  getMembershipByStripeSubscription,
  updateMembership,
} from "@/lib/dal/memberships";
import { recordStripeEvent } from "@/lib/dal/stripe-events";
import { constructStripeEvent, StripeSignatureError, type StripeEvent } from "@/lib/stripe-webhook";
import { logger } from "@/lib/logger";

/**
 * POST /api/membership/webhook
 * Stripe webhook handler for membership lifecycle events.
 * Handles: checkout.session.completed, invoice.paid,
 *          customer.subscription.updated, customer.subscription.deleted
 *
 * Security (audit F-001 / A-1):
 *  - Verifies the Stripe-Signature header against
 *    STRIPE_WEBHOOK_SECRET using HMAC-SHA256 before doing anything.
 *  - Records each event id in the `stripe_events` table so replayed
 *    deliveries (Stripe retries any non-2xx) never apply side effects
 *    twice.
 *  - If memberships are not configured yet (no STRIPE_SECRET_KEY or
 *    STRIPE_WEBHOOK_SECRET) we return 503 unconditionally so forged
 *    webhooks cannot reach the handler.
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    logger.error("Stripe webhook: missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // Read raw body for signature verification — must not be re-parsed
  // or normalized before HMAC comparison.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  let event: StripeEvent;
  try {
    event = await constructStripeEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    if (err instanceof StripeSignatureError) {
      logger.warn("Stripe webhook signature verification failed", { error: err.message });
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    logger.error("Stripe webhook verification error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "Webhook verification failed" }, { status: 400 });
  }

  // Idempotency: reject replays before doing any work. If the insert
  // fails for any reason other than a duplicate PK we fall through to
  // the 500 handler below so Stripe retries the delivery.
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
        const session = event.data.object;
        const metadata = session.metadata as Record<string, string> | undefined;
        const email = session.customer_email as string;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const siteId = metadata?.site_id;
        const tier = (metadata?.tier as "insider" | "pro") || "insider";

        if (email && siteId && subscriptionId) {
          // Fetch subscription details from Stripe
          const subRes = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
            headers: { Authorization: `Bearer ${stripeKey}` },
          });
          const sub = await subRes.json();

          await createMembership({
            site_id: siteId,
            email,
            tier,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            current_period_start: sub.current_period_start
              ? new Date(sub.current_period_start * 1000).toISOString()
              : undefined,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : undefined,
          });

          logger.info("Membership created via Stripe checkout", { email, siteId, tier });
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription as string;

        if (subscriptionId) {
          const membership = await getMembershipByStripeSubscription(subscriptionId);
          if (membership) {
            // Fetch updated subscription period
            const subRes = await fetch(
              `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
              { headers: { Authorization: `Bearer ${stripeKey}` } },
            );
            const sub = await subRes.json();

            await updateMembership(membership.id, {
              status: "active",
              current_period_start: sub.current_period_start
                ? new Date(sub.current_period_start * 1000).toISOString()
                : undefined,
              current_period_end: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : undefined,
            });
            logger.info("Membership renewed", { email: membership.email });
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const subscriptionId = subscription.id as string;
        const status = subscription.status as string;

        const membership = await getMembershipByStripeSubscription(subscriptionId);
        if (membership) {
          const mappedStatus = mapStripeStatus(status);
          await updateMembership(membership.id, { status: mappedStatus });
          logger.info("Membership status updated", {
            email: membership.email,
            status: mappedStatus,
          });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const subscriptionId = subscription.id as string;

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
