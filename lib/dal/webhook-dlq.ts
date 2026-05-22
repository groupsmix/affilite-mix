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
 * Best-effort — logs but does not throw on DB errors.
 */
export async function writeToDlq(entry: DlqEntry): Promise<void> {
  try {
    const sb = getPrivilegedSupabaseClient();
    const { error } = await sb.from("webhook_dlq").upsert(
      {
        event_id: entry.event_id,
        event_type: entry.event_type,
        payload: entry.payload,
        error_message: entry.error_message,
        attempts: entry.attempts,
        status: "pending",
      },
      { onConflict: "event_id" },
    );
    if (error) {
      logger.error("Failed to write webhook event to DLQ table", {
        event_id: entry.event_id,
        dbError: error.message,
      });
    } else {
      logger.info("Webhook event written to DLQ", {
        event_id: entry.event_id,
        event_type: entry.event_type,
      });
    }
  } catch (err) {
    logger.error("DLQ write exception", {
      event_id: entry.event_id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Mark a DLQ entry as replayed/resolved.
 */
export async function resolveDlqEntry(eventId: string): Promise<void> {
  try {
    const sb = getPrivilegedSupabaseClient();
    await sb
      .from("webhook_dlq")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("event_id", eventId);
  } catch (err) {
    logger.error("Failed to resolve DLQ entry", {
      event_id: eventId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
