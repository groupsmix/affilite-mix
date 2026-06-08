import type Stripe from "stripe";
import { applyStripeEventAtomic, type StripeEventOp } from "@/lib/dal/stripe-events";
import { logger } from "@/lib/logger";
import { recordAuditEvent } from "@/lib/audit-log";

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
    // A167-01: Record membership mutations in the audit trail
    await recordMembershipAudit(event.type, payload, result.membership_id).catch((err) => {
      logger.warn("Failed to record membership audit event", { error: err });
    });
  }

  return { duplicate: result.duplicate, membershipId: result.membership_id };
}

/**
 * FR-004: Stripe type-gap accessors.
 *
 * The installed `stripe` typings omit a few fields the live API still returns:
 * the legacy top-level `invoice.subscription`, the newer
 * `invoice.parent.subscription_details` relationship, `charge.invoice`, and the
 * `current_period_*` timestamps that moved off the Subscription root in recent
 * API versions. These narrow shapes isolate the unavoidable reach past the
 * published types into one documented place instead of scattering
 * `as unknown as { ... }` across every call site.
 */
type InvoiceSubscriptionFields = {
  subscription?: string | Stripe.Subscription | null;
  parent?: {
    subscription_details?: {
      subscription?: string | Stripe.Subscription | null;
    } | null;
  } | null;
};

type ChargeInvoiceField = { invoice?: string | Stripe.Invoice | null };

type SubscriptionPeriodFields = {
  current_period_start?: number | null;
  current_period_end?: number | null;
};

/** Extract the current billing-period window from a retrieved subscription. */
function getSubscriptionPeriod(sub: Stripe.Subscription): {
  current_period_start: string | undefined;
  current_period_end: string | undefined;
} {
  const period = sub as unknown as SubscriptionPeriodFields;
  return {
    current_period_start: toIsoOrUndefined(period.current_period_start),
    current_period_end: toIsoOrUndefined(period.current_period_end),
  };
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const fields = invoice as unknown as InvoiceSubscriptionFields;

  const legacySubscription = fields.subscription;
  if (typeof legacySubscription === "string") return legacySubscription;
  if (legacySubscription && typeof legacySubscription === "object" && "id" in legacySubscription) {
    return legacySubscription.id;
  }

  const nested = fields.parent?.subscription_details?.subscription;
  if (typeof nested === "string") return nested;
  if (nested && typeof nested === "object" && "id" in nested) {
    return nested.id;
  }
  return undefined;
}

function getChargeInvoiceId(charge: Stripe.Charge): string | undefined {
  const invoice = (charge as unknown as ChargeInvoiceField).invoice;
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
        ...getSubscriptionPeriod(sub),
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
        ...getSubscriptionPeriod(sub),
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

/**
 * A167-01: Record membership mutations in the audit trail.
 * Best-effort — failures are caught by the caller and logged.
 */
async function recordMembershipAudit(
  eventType: string,
  payload: StripeEventOp,
  membershipId: string | null,
): Promise<void> {
  if (payload.op === "noop") return;

  const action = `membership.${payload.op}`;
  const details: Record<string, unknown> = { stripe_event_type: eventType };

  switch (payload.op) {
    case "create_membership":
      details.status = "active";
      details.tier = payload.tier;
      details.stripe_subscription_id = payload.stripe_subscription_id;
      details.stripe_customer_id = payload.stripe_customer_id;
      details.current_period_start = payload.current_period_start;
      details.current_period_end = payload.current_period_end;
      break;
    case "renew_membership":
      details.status = "active";
      details.stripe_subscription_id = payload.stripe_subscription_id;
      details.current_period_start = payload.current_period_start;
      details.current_period_end = payload.current_period_end;
      break;
    case "update_status":
      details.status = payload.status;
      details.stripe_subscription_id = payload.stripe_subscription_id;
      details.tier = payload.tier;
      break;
    case "cancel_membership":
      details.status = "cancelled";
      details.stripe_subscription_id = payload.stripe_subscription_id;
      break;
  }

  await recordAuditEvent({
    site_id:
      "op" in payload && "site_id" in payload
        ? (payload as { site_id: string }).site_id
        : "_global",
    actor: "stripe-webhook",
    action,
    entity_type: "membership",
    entity_id: membershipId ?? "unknown",
    details,
  });
}
