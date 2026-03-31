import { getServiceClient } from "@/lib/supabase-server";
import { assertRows } from "./type-guards";

export interface AuditLogEntry {
  id: string;
  site_id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip: string;
  created_at: string;
}

export interface AuditLogFilters {
  action?: string;
  actor?: string;
  entityType?: string;
  search?: string;
}

/** Columns selected for audit log queries */
const AUDIT_COLUMNS = "id, site_id, actor, action, entity_type, entity_id, details, ip, created_at" as const;

export async function listAuditLogs(
  siteId: string,
  limit = 50,
  offset = 0,
  filters?: AuditLogFilters,
): Promise<AuditLogEntry[]> {
  const sb = getServiceClient();
  let query = sb
    .from("audit_log")
    .select(AUDIT_COLUMNS)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  if (filters?.action) query = query.eq("action", filters.action);
  if (filters?.actor) query = query.ilike("actor", `%${filters.actor}%`);
  if (filters?.entityType) query = query.eq("entity_type", filters.entityType);

  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<AuditLogEntry>(data ?? []);
}

/** Get distinct actions for filter dropdown */
export async function getDistinctActions(siteId: string): Promise<string[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("audit_log")
    .select("action")
    .eq("site_id", siteId)
    .order("action");

  if (error) throw error;
  const unique = new Set(assertRows<{ action: string }>(data ?? []).map((d) => d.action));
  return Array.from(unique);
}
