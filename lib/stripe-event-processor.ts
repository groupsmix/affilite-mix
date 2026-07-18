import type Stripe from "stripe";
import { applyStripeEventAtomic, type StripeEventOp } from "@/lib/dal/stripe-events";
import { writeToDlq } from "@/lib/dal/webhook-dlq";
import { logger } from "@/lib/logger";
import { recordAuditEvent } from "@/lib/audit-log";
import { captureException } from "@/lib/sentry";

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

  // Bug 3 (S1-A10-03): the RPC reports `missed_update` when a renew/update/cancel
  // matched 0 rows — an out-of-order delivery where the membership row does not
  // exist yet. Crucially the RPC has ALREADY committed the `stripe_events`
  // idempotency row (it RAISE WARNINGs + RETURNs rather than RAISE EXCEPTION), so
  // throwing to force a Stripe retry is futile: the retry re-enters the RPC, hits
  // ON CONFLICT DO NOTHING, and comes back as `duplicate` → silent 200. The event
  // id is already burned. The only way to recover the lost mutation is to capture
  // it durably for out-of-band reconciliation, so route it to the DLQ. writeToDlq
  // throws on persistence failure; we let that propagate (fail loud) so the route
  // returns 5xx and the drop is alerted rather than swallowed.
  if (result.missed_update) {
    await writeToDlq({
      event_id: event.id,
      event_type: event.type,
      payload: payload as unknown as Record<string, unknown>,
      error_message: `missed_update: ${payload.op} matched 0 membership rows (out-of-order webhook delivery)`,
      attempts: 1,
    });
    logger.warn(
      "Stripe event missed its target membership row — routed to DLQ for reconciliation",
      {
        id: event.id,
        type: event.type,
        op: payload.op,
      },
    );
    return { duplicate: false, membershipId: null };
  }

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

  // Issue 3 / P1: if the RPC detected an orphaned duplicate subscription,
  // cancel it via the Stripe API to stop double-billing. The RPC has already
  // committed the event row (so Stripe won't retry), and the audit_log entry
  // inside the RPC records the detection. We cancel best-effort — if the
  // Stripe API call fails, the subscription stays active but the audit entry
  // is there for manual follow-up.
  if (result.orphan_subscription_id) {
    const orphanId = result.orphan_subscription_id;
    logger.warn("Orphaned duplicate subscription detected — cancelling via Stripe API", {
      orphanSubscriptionId: orphanId,
      eventId: event.id,
      eventType: event.type,
    });
    try {
      await stripe.subscriptions.cancel(orphanId);
      logger.info("Orphaned subscription cancelled successfully", {
        orphanSubscriptionId: orphanId,
      });
    } catch (err) {
      // The subscription may already be cancelled, or the Stripe API may be
      // temporarily unavailable. Log + Sentry so ops can follow up manually.
      logger.error("Failed to cancel orphaned subscription — manual follow-up required", {
        orphanSubscriptionId: orphanId,
        error: err instanceof Error ? err.message : String(err),
      });
      captureException(err, {
        context: "orphan_subscription_cancellation_failed",
        orphanSubscriptionId: orphanId,
      });
    }
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
  items?: {
    data?: Array<
      | {
          current_period_start?: number | null;
          current_period_end?: number | null;
        }
      | null
      | undefined
    > | null;
  } | null;
};

/**
 * Extract the current billing-period window from a retrieved subscription.
 *
 * Bug 4: API version `2026-05-27.dahlia` (pinned in lib/stripe-client.ts) moved
 * `current_period_start/end` off the Subscription root onto each subscription
 * *item* (`subscription.items.data[].current_period_*`) — the very path this
 * file already uses to read `price.id`. Reading the root alone now yields
 * `undefined`, so memberships persist NULL periods. Prefer the item-level
 * fields and fall back to the legacy root for older API versions / safety.
 * Both the create (`checkout.session.completed`) and renew (`invoice.paid`)
 * paths flow through this accessor.
 */
function getSubscriptionPeriod(sub: Stripe.Subscription): {
  current_period_start: string | undefined;
  current_period_end: string | undefined;
} {
  const period = sub as unknown as SubscriptionPeriodFields;
  const item = period.items?.data?.[0] ?? undefined;
  return {
    current_period_start: toIsoOrUndefined(
      item?.current_period_start ?? period.current_period_start,
    ),
    current_period_end: toIsoOrUndefined(item?.current_period_end ?? period.current_period_end),
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

      // F-04: Fail loud on Stripe API retrieval failures so Stripe retries
      // the webhook. Only after Stripe's retry budget exhausts does the
      // event go to DLQ. Silent noop would create memberships with missing
      // period fields and users would pay without getting access.
      let sub;
      try {
        sub = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (err) {
        const wrapped = new ProcessorError(
          "checkout.session.completed: subscription retrieval failed",
          { cause: err },
        );
        logger.error(wrapped.message, { subscriptionId, cause: String(err) });
        // Throw to trigger 5xx response → Stripe retry → DLQ after retry budget
        throw wrapped;
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

      // F-04: Fail loud on Stripe API retrieval failures
      let sub;
      try {
        sub = await stripe.subscriptions.retrieve(subscriptionId);
      } catch (err) {
        const wrapped = new ProcessorError("invoice.paid: subscription retrieval failed", {
          cause: err,
        });
        logger.error(wrapped.message, { subscriptionId, cause: String(err) });
        throw wrapped;
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
      // F-04: Fail loud on Stripe API retrieval failures
      let invoice;
      try {
        invoice = await stripe.invoices.retrieve(invoiceId);
      } catch (err) {
        const wrapped = new ProcessorError("charge.refunded: invoice retrieval failed", {
          cause: err,
        });
        logger.error(wrapped.message, { invoiceId, cause: String(err) });
        throw wrapped;
      }
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) return { op: "noop" };

      // A169-01: only cancel on full refund; partial refunds just log
      if (isFullRefund) {
        // F1: this sets the local membership to 'cancelled' but does NOT cancel
        // the Stripe subscription, so Stripe may keep emitting invoice.paid /
        // subscription.updated for it. The DB function apply_stripe_membership_event
        // (migration 2026062202) refuses to flip a 'cancelled'/'disputed' membership
        // back to 'active', so those later events cannot resurrect this entitlement.
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
      // F-04: Fail loud on Stripe API retrieval failures
      let charge;
      try {
        charge = await stripe.charges.retrieve(dispute.charge);
      } catch (err) {
        const wrapped = new ProcessorError("charge.dispute: charge retrieval failed", {
          cause: err,
        });
        logger.error(wrapped.message, { chargeId: dispute.charge, cause: String(err) });
        throw wrapped;
      }
      const invoiceId = getChargeInvoiceId(charge);
      if (!invoiceId) return { op: "noop" };
      // F-04: Fail loud on Stripe API retrieval failures
      let invoice;
      try {
        invoice = await stripe.invoices.retrieve(invoiceId);
      } catch (err) {
        const wrapped = new ProcessorError("charge.dispute: invoice retrieval failed", {
          cause: err,
        });
        logger.error(wrapped.message, { invoiceId, cause: String(err) });
        throw wrapped;
      }
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) return { op: "noop" };

      // A169-02: set to "disputed" instead of "past_due" for clear audit trail.
      // F1: the Stripe subscription is intentionally left as-is (we do not auto-cancel
      // it here — a dispute may still be won). The terminal-state guard in
      // apply_stripe_membership_event (migration 2026062202) ensures a later
      // invoice.paid / customer.subscription.updated cannot flip this 'disputed'
      // membership back to 'active', so the anti-abuse hold survives renewals.
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

function resolveTierFromPriceId(priceId: string): "insider" | "pro" {
  const tiers: Array<"insider" | "pro"> = ["insider", "pro"];
  for (const tier of tiers) {
    const envKey = `STRIPE_PRICE_ID_${tier.toUpperCase()}`;
    if (process.env[envKey] === priceId) return tier;
  }
  // F-15: Fail loud on unknown price IDs instead of silently mapping to undefined
  // This prevents revenue-affecting silent failures where users pay but get
  // the wrong tier. Emit a Sentry error and audit log entry.
  const error = new Error(
    `Unknown Stripe price ID: ${priceId}. Update STRIPE_PRICE_ID_INSIDER or STRIPE_PRICE_ID_PRO env vars.`,
  );
  logger.error(error.message, { priceId });
  // Capture to Sentry for alerting (no-op when SENTRY_DSN is unset).
  captureException(error, { tags: { priceId } });
  // Default to "insider" as a safe fallback, but the error is logged and alerted
  throw error;
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
