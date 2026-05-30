import type Stripe from "stripe";
import { applyStripeEventAtomic, type StripeEventOp } from "@/lib/dal/stripe-events";
import { logger } from "@/lib/logger";

/** A91-2: Typed error wrapper preserving the original cause. */
class ProcessorError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProcessorError";
  }
}

export interface StripeProcessingResult {
  duplicate: boolean;
  membershipId: string | null;
}

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

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const legacySubscription = (
    invoice as unknown as { subscription?: string | Stripe.Subscription | null }
  ).subscription;
  if (typeof legacySubscription === "string") return legacySubscription;
  if (legacySubscription && typeof legacySubscription === "object" && "id" in legacySubscription) {
    return legacySubscription.id;
  }

  const parent = (
    invoice as unknown as {
      parent?: {
        subscription_details?: {
          subscription?: string | Stripe.Subscription | null;
        } | null;
      } | null;
    }
  ).parent;
  const nested = parent?.subscription_details?.subscription;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object" && "id" in nested) {
    return nested.id;
  }
  return undefined;
}

function getChargeInvoiceId(charge: Stripe.Charge): string | undefined {
  const invoice = (charge as unknown as { invoice?: string | Stripe.Invoice | null }).invoice;
  if (typeof invoice === "string") return invoice;
  if (invoice && typeof invoice === "object" && "id" in invoice) return invoice.id;
  return undefined;
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
        return { op: "noop" };
      }

      let sub;
      try {
        sub = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (err) {
        const wrapped = new ProcessorError(
          "checkout.session.completed: subscription retrieval failed",
          { cause: err },
        );
        logger.error(wrapped.message, { subscriptionId, cause: String(err) });
        return { op: "noop" };
      }
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
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) return { op: "noop" };

      let sub;
      try {
        sub = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (err) {
        const wrapped = new ProcessorError("invoice.paid: subscription retrieval failed", {
          cause: err,
        });
        logger.error(wrapped.message, { subscriptionId, cause: String(err) });
        return { op: "noop" };
      }
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
      const currentPriceId = subscription.items?.data?.[0]?.price?.id ?? undefined;
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

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const paymentIntentId =
        typeof charge.payment_intent === "string" ? charge.payment_intent : undefined;
      // A169-01: distinguish partial vs full refund
      const amountRefunded = charge.amount_refunded ?? 0;
      const amountTotal = charge.amount ?? 0;
      const isFullRefund = amountTotal > 0 && amountRefunded >= amountTotal;
      logger.info("Stripe charge refunded", {
        chargeId: charge.id,
        paymentIntentId,
        amountRefunded,
        amountTotal,
        isFullRefund,
      });

      const invoiceId = getChargeInvoiceId(charge);
      if (!invoiceId) return { op: "noop" };
      let invoice;
      try {
        invoice = await stripe.invoices.retrieve(invoiceId);
      } catch (err) {
        const wrapped = new ProcessorError("charge.refunded: invoice retrieval failed", {
          cause: err,
        });
        logger.error(wrapped.message, { invoiceId, cause: String(err) });
        return { op: "noop" };
      }
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) return { op: "noop" };

      // A169-01: only cancel on full refund; partial refunds just log
      if (isFullRefund) {
        return {
          op: "cancel_membership",
          stripe_subscription_id: subscriptionId,
        };
      }
      logger.info("Partial refund — membership retained", {
        subscriptionId,
        amountRefunded,
        amountTotal,
      });
      return { op: "noop" };
    }

    case "charge.dispute.created":
    case "charge.dispute.updated": {
      const dispute = event.data.object as Stripe.Dispute;
      // A169-02: auto-suspend membership on dispute
      logger.warn("Stripe dispute received — auto-suspending membership", {
        disputeId: dispute.id,
        status: dispute.status,
        amount: dispute.amount,
        currency: dispute.currency,
      });

      if (!dispute.charge || typeof dispute.charge !== "string") return { op: "noop" };
      let charge;
      try {
        charge = await stripe.charges.retrieve(dispute.charge);
      } catch (err) {
        const wrapped = new ProcessorError("charge.dispute: charge retrieval failed", {
          cause: err,
        });
        logger.error(wrapped.message, { chargeId: dispute.charge, cause: String(err) });
        return { op: "noop" };
      }
      const invoiceId = getChargeInvoiceId(charge);
      if (!invoiceId) return { op: "noop" };
      let invoice;
      try {
        invoice = await stripe.invoices.retrieve(invoiceId);
      } catch (err) {
        const wrapped = new ProcessorError("charge.dispute: invoice retrieval failed", {
          cause: err,
        });
        logger.error(wrapped.message, { invoiceId, cause: String(err) });
        return { op: "noop" };
      }
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) return { op: "noop" };

      // A169-02: set to "disputed" instead of "past_due" for clear audit trail
      return {
        op: "update_status",
        stripe_subscription_id: subscriptionId,
        status: "disputed",
      };
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
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
    default:
      return "past_due";
  }
}
