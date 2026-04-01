import { getServiceClient } from "@/lib/supabase-server";

export interface AuditEvent {
  site_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details?: Record<string, unknown>;
  ip?: string;
}

/**
 * Record an audit event in the audit_log table.
 * Awaitable with a single retry on failure.
 * Callers may fire-and-forget or await for compliance-critical paths.
 */
export async function recordAuditEvent(event: AuditEvent): Promise<void> {
  const row = {
    site_id: event.site_id,
    actor: event.actor,
    action: event.action,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    details: event.details ?? {},
    ip: event.ip ?? "",
  };

  const sb = getServiceClient();
  const { error } = await sb.from("audit_log").insert(row);

  if (error) {
    console.error("[audit-log] Insert failed, retrying once:", error.message);
    // Single retry
    const { error: retryError } = await sb.from("audit_log").insert(row);
    if (retryError) {
      console.error("[audit-log] Retry also failed:", retryError.message);
    }
  }
}
