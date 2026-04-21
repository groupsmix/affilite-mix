import { getServiceClient } from "@/lib/supabase-server";
import { escapeLike } from "./search-utils";
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

/**
 * Optional filters for audit-log reads.
 *
 * - `action` / `actions`: exact-match (`action`) or multi-value (`actions`) filter.
 *   `actions` takes precedence when both are present.
 * - `entityType` / `entityTypes`: same pattern for entity types.
 * - `actor`: substring match on the actor column (ILIKE, LIKE chars escaped).
 * - `q`: free-text search; matches actor OR entity_id with ILIKE.
 * - `from` / `to`: ISO timestamps bounding `created_at` (inclusive).
 */
export interface AuditLogFilters {
  action?: string;
  actions?: string[];
  actor?: string;
  entityType?: string;
  entityTypes?: string[];
  q?: string;
  from?: string;
  to?: string;
  /** @deprecated Prefer `q` for cross-field search. Retained for compatibility. */
  search?: string;
}

/** Columns selected for audit log queries */
const AUDIT_COLUMNS =
  "id, site_id, actor, action, entity_type, entity_id, details, ip, created_at" as const;

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

  if (filters?.actions && filters.actions.length > 0) {
    query = query.in("action", filters.actions);
  } else if (filters?.action) {
    query = query.eq("action", filters.action);
  }

  if (filters?.entityTypes && filters.entityTypes.length > 0) {
    query = query.in("entity_type", filters.entityTypes);
  } else if (filters?.entityType) {
    query = query.eq("entity_type", filters.entityType);
  }

  if (filters?.actor) {
    query = query.ilike("actor", `%${escapeLike(filters.actor)}%`);
  }

  if (filters?.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    query = query.or(`actor.ilike.${pattern},entity_id.ilike.${pattern}`);
  }

  if (filters?.from) query = query.gte("created_at", filters.from);
  if (filters?.to) query = query.lte("created_at", filters.to);

  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) throw error;
  return assertRows<AuditLogEntry>(data ?? []);
}

/** Count audit-log rows matching the same filters used by `listAuditLogs`. */
export async function countAuditLogs(siteId: string, filters?: AuditLogFilters): Promise<number> {
  const sb = getServiceClient();
  let query = sb
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq("site_id", siteId);

  if (filters?.actions && filters.actions.length > 0) {
    query = query.in("action", filters.actions);
  } else if (filters?.action) {
    query = query.eq("action", filters.action);
  }

  if (filters?.entityTypes && filters.entityTypes.length > 0) {
    query = query.in("entity_type", filters.entityTypes);
  } else if (filters?.entityType) {
    query = query.eq("entity_type", filters.entityType);
  }

  if (filters?.actor) {
    query = query.ilike("actor", `%${escapeLike(filters.actor)}%`);
  }

  if (filters?.q) {
    const pattern = `%${escapeLike(filters.q)}%`;
    query = query.or(`actor.ilike.${pattern},entity_id.ilike.${pattern}`);
  }

  if (filters?.from) query = query.gte("created_at", filters.from);
  if (filters?.to) query = query.lte("created_at", filters.to);

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
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

/** Get distinct entity types for filter dropdown */
export async function getDistinctEntityTypes(siteId: string): Promise<string[]> {
  const sb = getServiceClient();
  const { data, error } = await sb
    .from("audit_log")
    .select("entity_type")
    .eq("site_id", siteId)
    .order("entity_type");

  if (error) throw error;
  const unique = new Set(assertRows<{ entity_type: string }>(data ?? []).map((d) => d.entity_type));
  return Array.from(unique);
}
