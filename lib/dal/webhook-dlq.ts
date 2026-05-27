/**
 * F-21: Durable Dead Letter Queue (DLQ) for failed Stripe webhook events.
 *
 * Instead of relying solely on KV-based retry counters and log-based DLQ,
 * this module writes failed events to a persistent `webhook_dlq` table
 * for replay tooling, alerting, and reconciliation.
 *
 * Table schema (create via migration):
 *   CREATE TABLE webhook_dlq (
 *     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     event_id TEXT NOT NULL UNIQUE,
 *     event_type TEXT NOT NULL,
 *     payload JSONB NOT NULL,
 *     error_message TEXT,
 *     attempts INTEGER NOT NULL DEFAULT 1,
 *     status TEXT NOT NULL DEFAULT 'pending', -- pending | replayed | resolved
 *     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 *     resolved_at TIMESTAMPTZ
 *   );
 */

import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { logger } from "@/lib/logger";

export interface DlqEntry {
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  error_message: string;
  attempts: number;
}

/**
 * Write a failed webhook event to the durable DLQ table.
 *
 * R2-01: This function now THROWS on failure so that callers cannot
 * silently ACK a webhook when the DLQ write did not persist. The caller
 * (webhook route) must catch and return a 500 to trigger Stripe retry.
 *
 * Note: site_id scoping is intentionally omitted — Stripe webhook events
 * are platform-level and do not carry tenant context. The webhook_dlq
 * table is not RLS-protected; access is restricted via service-role only.
 */
export async function writeToDlq(entry: DlqEntry): Promise<void> {
  const sb = getPrivilegedSupabaseClient();
  const { error } = await sb
    .from("webhook_dlq")
    .upsert(
      {
        event_id: entry.event_id,
        event_type: entry.event_type,
        payload: entry.payload as unknown as import("@/types/supabase").Json,
        error_message: entry.error_message,
        attempts: entry.attempts,
        status: "pending",
      },
      { onConflict: "event_id" },
    )
    .unsafeNoSiteFilter();
  if (error) {
    logger.error("Failed to write webhook event to DLQ table", {
      event_id: entry.event_id,
      dbError: error.message,
    });
    throw new Error(`DLQ write failed for event ${entry.event_id}: ${error.message}`);
  }
  logger.info("Webhook event written to DLQ", {
    event_id: entry.event_id,
    event_type: entry.event_type,
  });
}

export interface DlqListRow {
  id: string;
  event_id: string;
  event_type: string;
  error_message: string | null;
  attempts: number;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

/**
 * List DLQ entries filtered by status (R-014).
 * Platform-level query — no site_id scoping.
 */
export async function listDlqEntries(
  status: "pending" | "replayed" | "resolved",
  limit: number,
): Promise<DlqListRow[]> {
  const sb = getPrivilegedSupabaseClient();

  const { data, error } = await sb
    .from("webhook_dlq")
    .select("id, event_id, event_type, error_message, attempts, status, created_at, resolved_at")
    .unsafeNoSiteFilter()
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as DlqListRow[];
}

/**
 * Mark a DLQ entry as replayed/resolved.
 * Throws on failure so callers can detect and handle resolution errors.
 */
export async function resolveDlqEntry(eventId: string): Promise<void> {
  const sb = getPrivilegedSupabaseClient();
  const { error } = await sb
    .from("webhook_dlq")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .unsafeNoSiteFilter()
    .eq("event_id", eventId);
  if (error) {
    logger.error("Failed to resolve DLQ entry", {
      event_id: eventId,
      dbError: error.message,
    });
    throw new Error(`DLQ resolve failed for event ${eventId}: ${error.message}`);
  }
}
