/**
 * F1: OF-08 reconciliation policy.
 *
 * `POST /api/cron/stripe-sync` Phase 2 pulls every *active* Stripe subscription and
 * compares it against the DB membership. The original code reactivated any membership
 * whose status was not "active" whenever Stripe showed the subscription active:
 *
 *     if (dbMembership.status !== "active") { update -> "active" }
 *
 * That conflates Stripe *billing* status with our *entitlement* decision. A chargeback
 * (membership set to "disputed") and a full refund (membership set to "cancelled") do
 * NOT cancel the underlying subscription; it stays "active" in Stripe. So on the next
 * cron tick the blanket rule above silently reverted the fraud hold and re-granted
 * access to a charged-back or refunded customer.
 *
 * Reconciliation only legitimately exists to repair *dropped webhooks* for transient
 * billing states: a payment that recovered ("past_due") or a renewal we never recorded
 * ("expired"). Those, and only those, may be auto-corrected back to "active".
 *
 * This is an allowlist on purpose: any status not listed here defaults to "do not
 * auto-reactivate", which is the correct fail-safe bias for a fraud control. Legitimate
 * reactivation after a won dispute must arrive via its own Stripe event
 * (e.g. charge.dispute.closed), never via blanket reconciliation.
 */
export const RECONCILABLE_TO_ACTIVE: ReadonlySet<string> = new Set(["past_due", "expired"]);

/**
 * True when a non-active membership in `status` may be auto-corrected back to "active"
 * by OF-08 reconciliation (i.e. it represents transient billing drift, not a terminal
 * entitlement/fraud decision such as "disputed" or "cancelled").
 */
export function isReconcilableToActive(status: string): boolean {
  return RECONCILABLE_TO_ACTIVE.has(status);
}
