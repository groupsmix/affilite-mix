import { truncateIp } from "../get-client-ip";
import { getTenantClient } from "@/lib/supabase-server";
import { escapeLike } from "./search-utils";
import { assertRows } from "./type-guards";

/**
 * Audit-log reads are intentionally scoped to a single `site_id`.
 *
 * Every list/count/distinct helper in this module requires a `siteId` and
 * adds `eq("site_id", siteId)` to the query. Cross-site review (e.g. a
 * super_admin viewing rows from every tenant in one grid) is deliberately
 * **not supported** at the DAL level — it would break the multi-site RLS
 * contract documented in `docs/multi-site-architecture.md` and the
 * `dal-site-scoping` test suite. The admin audit-log page honors this by
 * resolving `session.activeSiteSlug → site_id` and never passing a list of
 * site ids. Keep this file that way; multi-site audit review should be a
 * separate DAL surface (and migration) if it is ever needed.
 */

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
  const sb = await getTenantClient();
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
  const sb = await getTenantClient();
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
  const sb = await getTenantClient();
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
  const sb = await getTenantClient();
  const { data, error } = await sb
    .from("audit_log")
    .select("entity_type")
    .eq("site_id", siteId)
    .order("entity_type");

  if (error) throw error;
  const unique = new Set(assertRows<{ entity_type: string }>(data ?? []).map((d) => d.entity_type));
  return Array.from(unique);
}

/**
 * Resolve audit `actor` strings to admin user ids.
 *
 * The audit log records `actor` as a denormalized string — almost always the
 * admin's email (see `recordAuditEvent` callers), with occasional literal
 * fallbacks like `"admin"` or a raw JWT `userId`. To render clickable actor
 * links in the audit grid we match each email-shaped actor against
 * `admin_users.email` (lowercased, the same shape the writer uses) and
 * return a map of actor → admin_users.id. Unmatched actors are simply
 * absent from the map and render as plain text.
 *
 * This is intentionally a single `IN (...)` query per page render; there is
 * no need for a join or a DB view because the set of actors on a single
 * audit-log page is small and bounded by `pageSize`.
 */
export async function resolveActorsToAdminUserIds(
  actors: readonly string[],
): Promise<Record<string, string>> {
  const emails = Array.from(
    new Set(
      actors.map((a) => a.trim().toLowerCase()).filter((a) => a.length > 0 && a.includes("@")),
    ),
  );
  if (emails.length === 0) return {};

  const sb = await getTenantClient();
  const { data, error } = await sb.from("admin_users").select("id, email").in("email", emails);
  if (error) throw error;

  const rows = assertRows<{ id: string; email: string }>(data ?? []);
  const byEmail = new Map<string, string>();
  for (const r of rows) {
    byEmail.set(r.email.toLowerCase(), r.id);
  }

  const out: Record<string, string> = {};
  for (const actor of actors) {
    const key = actor.trim().toLowerCase();
    const id = byEmail.get(key);
    if (id) out[actor] = id;
  }
  return out;
}
