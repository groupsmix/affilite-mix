import { getTenantClient } from "@/lib/supabase-server";

/**
 * DAL for the `stripe_events` idempotency table (audit F-001 / A-1).
 *
 * Stripe retries webhook deliveries on any non-2xx response and will
 * also redeliver events from its dashboard, so the handler must be
 * idempotent. We record every event id we start processing; repeat
 * deliveries short-circuit before any side effects run.
 */

const TABLE = "stripe_events";

/**
 * Record that a Stripe webhook event has been received.
 *
 * Returns `true` when this is the first time we've seen the event
 * (safe to process), `false` when it's a duplicate (skip side effects
 * and return 200 so Stripe stops retrying).
 *
 * Duplicates are detected by a unique-violation (Postgres code 23505)
 * on the primary key, so concurrent webhook deliveries are handled
 * atomically — only one insert wins.
 */
export async function recordStripeEvent(
  stripeEventId: string,
  eventType: string,
): Promise<boolean> {
  const sb = await getTenantClient();

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

export async function getRecentStripeEventIds(since: Date): Promise<Set<string>> {
  const sb = await getTenantClient();

  const { data, error } = await sb
    .from(TABLE)
    .select("stripe_event_id")
    .gte("received_at", since.toISOString());

  if (error) throw error;

  return new Set((data as { stripe_event_id: string }[]).map((row) => row.stripe_event_id));
}
