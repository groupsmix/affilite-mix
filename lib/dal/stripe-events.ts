import { getTenantClient } from "@/lib/supabase-server";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { defaultDalClientGetter, type DalClientGetter } from "./dal-client";

/**
 * DAL for the `stripe_events` idempotency table (audit F-001 / A-1).
 *
 * Stripe retries webhook deliveries on any non-2xx response and will
 * also redeliver events from its dashboard, so the handler must be
 * idempotent. We record every event id we start processing; repeat
 * deliveries short-circuit before any side effects run.
 *
 * LIVE-10 / F-024: the preferred entry point is now
 * `applyStripeEventAtomic`, which delegates to a SECURITY DEFINER
 * Postgres RPC (`apply_stripe_membership_event`) that records the
 * event id and runs the membership-side effect inside a single
 * transaction. The legacy `recordStripeEvent` helper below is kept
 * for backfill/reconciliation flows that genuinely want to record
 * the event id without applying any side effect.
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
      status: "active" | "cancelled" | "expired" | "past_due";
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

  const { data, error } = await sb.rpc("apply_stripe_membership_event", {
    p_stripe_event_id: stripeEventId,
    p_event_type: eventType,
    p_event_data: payload as unknown as Record<string, unknown>,
  });

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

/**
 * Record that a Stripe webhook event has been received (without any
 * side effect).
 *
 * Returns `true` when this is the first time we've seen the event
 * (safe to process), `false` when it's a duplicate (skip side effects
 * and return 200 so Stripe stops retrying).
 *
 * Duplicates are detected by a unique-violation (Postgres code 23505)
 * on the primary key, so concurrent webhook deliveries are handled
 * atomically — only one insert wins.
 *
 * Prefer `applyStripeEventAtomic` for the webhook hot path; this
 * helper is retained for tooling that records reconciled event ids
 * without applying a side effect.
 */
export async function recordStripeEvent(
  stripeEventId: string,
  eventType: string,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<boolean> {
  const sb = await getClient();

  const { error } = await sb.from(TABLE).insert({
    stripe_event_id: stripeEventId,
    event_type: eventType,
  });

  if (!error) return true;

  // Unique violation => we've already processed this event.
  if ((error as { code?: string }).code === "23505") {
    return false;
  }
  throw error;
}

export async function getRecentStripeEventIds(
  since: Date,
  getClient: DalClientGetter = defaultDalClientGetter,
): Promise<Set<string>> {
  const sb = await getClient();

  const { data, error } = await sb
    .from(TABLE)
    .select("stripe_event_id")
    .gte("received_at", since.toISOString());

  if (error) throw error;

  return new Set((data as { stripe_event_id: string }[]).map((row) => row.stripe_event_id));
}
