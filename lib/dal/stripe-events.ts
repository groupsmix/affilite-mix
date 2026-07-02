import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

/**
 * DAL for the `stripe_events` idempotency table (audit F-001 / A-1).
 *
 * Stripe retries webhook deliveries on any non-2xx response and will
 * also redeliver events from its dashboard, so the handler must be
 * idempotent. We record every event id we start processing; repeat
 * deliveries short-circuit before any side effects run.
 *
 * LIVE-10 / F-024: the entry point is `applyStripeEventAtomic`,
 * which delegates to a SECURITY DEFINER Postgres RPC
 * (`apply_stripe_membership_event`) that records the event id and
 * runs the membership-side effect inside a single transaction.
 */

const TABLE = "stripe_events";

/**
 * Discriminated union describing the membership side effect to apply
 * atomically alongside recording a Stripe event id.
 *
 * The shapes here mirror the `op` branches of the
 * `apply_stripe_membership_event` Postgres function.
 */
export type StripeEventOp =
  | {
      op: "create_membership";
      site_id: string;
      email: string;
      tier?: "insider" | "pro";
      stripe_customer_id?: string;
      stripe_subscription_id: string;
      current_period_start?: string;
      current_period_end?: string;
    }
  | {
      op: "renew_membership";
      stripe_subscription_id: string;
      current_period_start?: string;
      current_period_end?: string;
    }
  | {
      op: "update_status";
      stripe_subscription_id: string;
      status: "active" | "cancelled" | "expired" | "past_due" | "disputed";
      tier?: string;
    }
  | {
      op: "cancel_membership";
      stripe_subscription_id: string;
    }
  | { op: "noop" };

export interface StripeEventApplyResult {
  duplicate: boolean;
  membership_id: string | null;
  /**
   * S1-A10-03 / Bug 3: the RPC sets this when a renew/update/cancel UPDATE
   * matches 0 rows — an out-of-order delivery where the membership row does
   * not exist yet (e.g. a renewal arrives before checkout.session.completed).
   *
   * The RPC reports this via `RAISE WARNING` + `RETURN` (not `RAISE EXCEPTION`),
   * so by the time we read it the `stripe_events` idempotency row has ALREADY
   * been committed. A Stripe retry would therefore short-circuit as a duplicate
   * and the mutation would be lost — callers must capture it out-of-band
   * (durable DLQ) rather than relying on retry. Surfaced here via a local cast;
   * `types/supabase.ts` deliberately left untouched.
   */
  missed_update?: boolean;
  /**
   * Issue 3 / P1: when a create_membership INSERT hits the unique partial
   * index on (email, site_id) WHERE status = 'active', the RPC catches the
   * unique_violation, commits the event row (so Stripe does not retry), and
   * returns the orphaned Stripe subscription id here. The application layer
   * must cancel this subscription via the Stripe API to stop double-billing.
   */
  orphan_subscription_id?: string | null;
}

/**
 * Atomic version of `recordStripeEvent` + side effect.
 *
 * Calls the `apply_stripe_membership_event` RPC, which:
 *  1. Inserts the event id into `stripe_events` (ON CONFLICT DO NOTHING).
 *  2. If the insert won, applies the membership change described by
 *     `op` in the same transaction. Any failure rolls the event row
 *     back so Stripe's retry sees a fresh id and re-runs.
 *  3. Returns `{ duplicate: true }` when the insert lost (i.e. the
 *     event was already processed).
 *
 * Deduplication relies on a unique constraint on `stripe_event_id`
 * (Postgres error 23505) enforced via ON CONFLICT DO NOTHING inside
 * the RPC, so application-level error handling is not needed.
 *
 * Uses the privileged service-role client because the RPC is granted
 * to `service_role` and the `stripe_events` table denies all
 * authenticated/anon access.
 */
export async function applyStripeEventAtomic(
  stripeEventId: string,
  eventType: string,
  payload: StripeEventOp,
): Promise<StripeEventApplyResult> {
  const sb = getPrivilegedSupabaseClient();

  // F-API-01 / NEW-03: Stripe events are cross-tenant (no p_site_id) —
  // opt out of the RPC guard explicitly.
  const { data, error } = await sb
    .rpc("apply_stripe_membership_event", {
      p_stripe_event_id: stripeEventId,
      p_event_type: eventType,
      p_event_data: payload as unknown as import("@/types/supabase").Json,
    })
    // SAFE: Stripe idempotency + membership RPC is platform-wide and not tenant-filterable.
    .unsafeNoSiteFilter();

  if (error) throw error;

  // The RPC always returns a JSONB object; supabase-js types it via
  // the Functions table in `types/supabase.ts`.
  const result = data as StripeEventApplyResult | null;
  if (!result) {
    // Defensive: should never happen in practice because the function
    // always returns a JSONB object. Treat as a non-duplicate so the
    // caller surfaces the inconsistency to logs.
    return { duplicate: false, membership_id: null };
  }
  return result;
}

export async function getRecentStripeEventIds(
  since: Date,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<Set<string>> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select("stripe_event_id")
    // SAFE: replay-dedup checks read the global Stripe event ledger across all tenants.
    .unsafeNoSiteFilter()
    .gte("received_at", since.toISOString());

  if (error) throw error;

  return new Set((data as { stripe_event_id: string }[]).map((row) => row.stripe_event_id));
}
