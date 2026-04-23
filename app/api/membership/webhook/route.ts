import { NextRequest, NextResponse } from "next/server";
import {
  createMembership,
  getMembershipByStripeSubscription,
  updateMembership,
} from "@/lib/dal/memberships";
import { logger } from "@/lib/logger";

/**
 * Verify Stripe webhook signature using HMAC-SHA256.
 * Compatible with Cloudflare Workers (crypto.subtle).
 *
 * Stripe signature format: t=<timestamp>,v1=<signature>
 * The signature is HMAC-SHA256(secret, timestamp + "." + payload)
 * Tolerance: 5 minutes
 */
async function verifyStripeSignature(
  payload: string,
  signature: string,
  secret: string,
): Promise<boolean> {
  try {
    const elements = signature.split(",");
    const timestamp = elements.find((e) => e.startsWith("t="))?.split("=")[1];
    const signatureHash = elements.find((e) => e.startsWith("v1="))?.split("=")[1];

    if (!timestamp || !signatureHash) {
      return false;
    }

    // Check timestamp tolerance (5 minutes)
    const now = Math.floor(Date.now() / 1000);
    const timestampNum = parseInt(timestamp, 10);
    if (now - timestampNum > 300) {
      logger.warn("Stripe webhook timestamp too old", { timestamp: timestampNum, now });
      return false;
    }

    // Compute HMAC-SHA256
    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(signedPayload);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const signatureBytes = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const expectedSignature = Array.from(new Uint8Array(signatureBytes))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // Constant-time comparison to prevent timing attacks
    if (signatureHash.length !== expectedSignature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < signatureHash.length; i++) {
      result |= signatureHash.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    return result === 0;
  } catch (err) {
    logger.error("Stripe signature verification failed", { error: err });
    return false;
  }
}

/**
 * POST /api/membership/webhook
 * Stripe webhook handler for membership lifecycle events.
 * Handles: checkout.session.completed, invoice.paid,
 *          customer.subscription.updated, customer.subscription.deleted
 *
 * Requires STRIPE_WEBHOOK_SECRET env var for signature verification.
 */
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!webhookSecret || !stripeKey) {
    logger.error("Stripe webhook: missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  // Read raw body for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  // Verify webhook signature
  const isValid = await verifyStripeSignature(rawBody, signature, webhookSecret);
  if (!isValid) {
    logger.warn("Invalid Stripe webhook signature", { signature: signature.substring(0, 20) + "..." });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: {
    type: string;
    data: { object: Record<string, unknown> };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
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
