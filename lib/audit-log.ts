import { getTenantClient } from "@/lib/supabase-server";

export interface AuditEvent {
  site_id: string;
  actor: string; // The human-readable actor name (e.g. email)
  actor_user_id?: string; // F-045: Strongly-typed UUID for the admin_user
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
    actor_user_id: event.actor_user_id,
    action: event.action,
    entity_type: event.entity_type,
    entity_id: event.entity_id,
    details: event.details ?? {},
    ip: event.ip ?? "",
  };

  const sb = await getTenantClient();
  const { error } = await sb.from("audit_log").insert(row);

  if (error) {
    console.error("[audit-log] Insert failed, retrying once:", error.message);
    // Single retry
    const { error: retryError } = await sb.from("audit_log").insert(row);
    if (retryError) {
      console.error("[audit-log] Retry also failed:", retryError.message);
      
      // F-013: Fallback analytics counter to track audit log write failures
      try {
        const analytics = (process.env as any).ANALYTICS_ENGINE as any;
        if (analytics && analytics.writeDataPoint) {
          analytics.writeDataPoint({
            blobs: ["audit_log_failure", event.site_id, event.actor, event.action],
            doubles: [1],
            indexes: [event.site_id]
          });
        }
      } catch (analyticsErr) {
        // Silently ignore if Analytics Engine is not bound
      }
    }
  }
}
