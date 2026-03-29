/**
 * Audit logging for admin actions.
 *
 * Records who did what to which entity. Currently uses 'admin' as the
 * actor since there's a single shared password. When per-user auth is
 * added, this will store the actual user identifier.
 *
 * Writes are fire-and-forget to avoid slowing down admin operations.
 */

import { getServiceClient } from "@/lib/supabase-server";

export interface AuditEntry {
  siteId: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}

/**
 * Record an admin action in the audit log.
 * Fire-and-forget — errors are logged but don't block the caller.
 */
export function recordAuditEvent(entry: AuditEntry): void {
  const sb = getServiceClient();

  sb.from("audit_log")
    .insert({
      site_id: entry.siteId,
      actor: "admin",
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      details: entry.details ?? {},
      ip_address: entry.ipAddress ?? "",
    } as never)
    .then(({ error }) => {
      if (error) {
        console.error("[audit-log] Failed to record event:", error.message);
      }
    });
}
