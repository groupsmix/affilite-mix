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

import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { logger } from "@/lib/logger";

export interface DlqEntry {
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  error_message: string;
  attempts: number;
}

/**
 * A162-03: Scrub PII from DLQ payloads before persistence.
 *
 * Recursively walks the payload and redacts:
 *   - Email addresses (RFC 5322 pattern)
 *   - Phone numbers (E.164 and common US/intl formats)
 *   - Known PII field names (name, address, etc.)
 */
const PII_FIELD_NAMES = new Set([
  "email",
  "customer_email",
  "receipt_email",
  "billing_email",
  "name",
  "customer_name",
  "billing_name",
  "shipping_name",
  "phone",
  "customer_phone",
  "billing_phone",
  "address_line1",
  "address_line2",
  "address_city",
  "address_state",
  "address_zip",
  "address_country",
  "line1",
  "line2",
  "city",
  "state",
  "postal_code",
  "ip_address",
]);

const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;

function scrubPiiFromValue(value: string): string {
  return value
    .replace(EMAIL_PATTERN, "[REDACTED_EMAIL]")
    .replace(PHONE_PATTERN, "[REDACTED_PHONE]");
}

function scrubPiiFromPayload(obj: unknown, depth = 0): unknown {
  if (depth > 20) return "[TRUNCATED]";

  if (typeof obj === "string") {
    return scrubPiiFromValue(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => scrubPiiFromPayload(item, depth + 1));
  }

  if (obj !== null && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (PII_FIELD_NAMES.has(key.toLowerCase())) {
        result[key] = "[REDACTED_PII]";
      } else {
        result[key] = scrubPiiFromPayload(value, depth + 1);
      }
    }
    return result;
  }

  return obj;
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
  // A162-03: scrub PII from payload before persisting to DLQ
  const scrubbedPayload = scrubPiiFromPayload(entry.payload) as Record<string, unknown>;
  const scrubbedError = scrubPiiFromValue(entry.error_message);

  const sb = getPrivilegedSupabaseClient();
  const { error } = await sb
    .from("webhook_dlq")
    .upsert(
      {
        event_id: entry.event_id,
        event_type: entry.event_type,
        payload: scrubbedPayload as unknown as import("@/types/supabase").Json,
        error_message: scrubbedError,
        attempts: entry.attempts,
        status: "pending",
      },
      { onConflict: "event_id" },
    )
    // SAFE: webhook DLQ stores platform-level Stripe events with no tenant context.
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
    // SAFE: DLQ review is a cross-tenant operator workflow over the global queue table.
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
    // SAFE: resolving DLQ entries mutates the platform-level webhook backlog.
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
