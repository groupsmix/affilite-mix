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
 * Fire-and-forget — errors are logged but never block the caller.
 */
export function recordAuditEvent(event: AuditEvent): void {
  const sb = getServiceClient();
  sb.from("audit_log")
    .insert({
      site_id: event.site_id,
      actor: event.actor,
      action: event.action,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      details: event.details ?? {},
      ip: event.ip ?? "",
    })
    .then(({ error }) => {
      if (error) {
        console.error("[audit-log] Failed to record event:", error.message);
      }
    });
}
