import { requireAdminSession } from "../components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import {
  listAuditLogs,
  countAuditLogs,
  getDistinctActions,
  getDistinctEntityTypes,
  resolveActorsToAdminUserIds,
} from "@/lib/dal/audit-log";
import { redirect } from "next/navigation";

import { AuditLogTable, type AuditLogTableRow } from "./audit-log-table";

/**
 * The audit-log page is intentionally scoped to the caller's *active* site.
 *
 * - `requireAdminSession` + `redirect("/admin")` block non-super_admin users.
 * - `resolveDbSiteId(session.activeSiteSlug)` pins the query to one tenant.
 * - `lib/dal/audit-log` only exposes site-scoped helpers (enforced by the
 *   `dal-site-scoping` test suite).
 *
 * Cross-site audit review is NOT supported on purpose: the audit_log table
 * is a per-site ledger and mixing rows from different tenants into one grid
 * would break the multi-site isolation contract documented in
 * `docs/multi-site-architecture.md`. If a future requirement truly calls
 * for platform-wide review, add a separate DAL surface + route rather than
 * bolting cross-site behavior onto this page.
 */

const DEFAULT_PAGE_SIZE = 50;
const ALLOWED_PAGE_SIZES = new Set([20, 50, 100, 200]);
const DEFAULT_WINDOW_MS = 48 * 60 * 60 * 1000; // 48h

interface AuditLogSearchParams {
  // Shared DataTable params
  q?: string;
  "f.action"?: string;
  "f.entity_type"?: string;
  page?: string;
  size?: string;
  sort?: string;
  // Audit-specific
  from?: string;
  to?: string;
  actor?: string;
  // Legacy params (bookmark compat)
  action?: string;
  entity_type?: string;
}

function parseCsvString(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((v) => v.length > 0);
}

function toIsoOrUndefined(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<AuditLogSearchParams>;
}) {
  const sp = await searchParams;

  // Legacy bookmark redirect: ?action=foo → ?f.action=foo, ?entity_type=bar → ?f.entity_type=bar
  const legacyAction = sp.action;
  const legacyEntityType = sp.entity_type;
  const hasModernAction = Boolean(sp["f.action"]);
  const hasModernEntityType = Boolean(sp["f.entity_type"]);
  if ((legacyAction && !hasModernAction) || (legacyEntityType && !hasModernEntityType)) {
    const params = new URLSearchParams();
    if (legacyAction && !hasModernAction) params.set("f.action", legacyAction);
    if (sp["f.action"]) params.set("f.action", sp["f.action"]);
    if (legacyEntityType && !hasModernEntityType) params.set("f.entity_type", legacyEntityType);
    if (sp["f.entity_type"]) params.set("f.entity_type", sp["f.entity_type"]);
    if (sp.q) params.set("q", sp.q);
    if (sp.actor) params.set("actor", sp.actor);
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    if (sp.page) params.set("page", sp.page);
    if (sp.size) params.set("size", sp.size);
    if (sp.sort) params.set("sort", sp.sort);
    redirect(`/admin/audit-log?${params.toString()}`);
  }

  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  if (session.role !== "super_admin") {
    redirect("/admin");
  }

  const siteId = await resolveDbSiteId(session.activeSiteSlug);

  const actions = parseCsvString(sp["f.action"]);
  const entityTypes = parseCsvString(sp["f.entity_type"]);
  const q = (sp.q ?? "").trim() || undefined;
  const actor = (sp.actor ?? "").trim() || undefined;

  // Default window: last 48h when caller didn't supply explicit bounds.
  const fromExplicit = toIsoOrUndefined(sp.from);
  const toExplicit = toIsoOrUndefined(sp.to);
  const from =
    fromExplicit ??
    (!toExplicit ? new Date(Date.now() - DEFAULT_WINDOW_MS).toISOString() : undefined);
  const to = toExplicit;

  const pageNum = Math.max(1, parseInt(sp.page ?? "1", 10) || 1);
  const rawSize = parseInt(sp.size ?? String(DEFAULT_PAGE_SIZE), 10);
  const pageSize = ALLOWED_PAGE_SIZES.has(rawSize) ? rawSize : DEFAULT_PAGE_SIZE;
  const offset = (pageNum - 1) * pageSize;

  const filters = {
    actions: actions.length > 0 ? actions : undefined,
    entityTypes: entityTypes.length > 0 ? entityTypes : undefined,
    actor,
    q,
    from,
    to,
  };

  const [logs, totalCount, distinctActions, distinctEntityTypes] = await Promise.all([
    listAuditLogs(siteId, pageSize, offset, filters),
    countAuditLogs(siteId, filters),
    getDistinctActions(siteId),
    getDistinctEntityTypes(siteId),
  ]);

  // Resolve email-shaped actors to admin user ids so the Actor column can
  // link through to the admin-users page for reviewers. Unresolved actors
  // (literal "admin", JWT userIds, deleted users) fall back to plain text.
  const actorUserIds = await resolveActorsToAdminUserIds(logs.map((log) => log.actor));

  const rows: AuditLogTableRow[] = logs.map((log) => ({
    id: log.id,
    created_at: log.created_at,
    actor: log.actor,
    actor_user_id: actorUserIds[log.actor] ?? null,
    action: log.action,
    entity_type: log.entity_type,
    entity_id: log.entity_id,
    ip: log.ip,
    details: log.details ?? {},
  }));

  const actionOptions = distinctActions.map((a) => ({ label: a, value: a }));
  const entityTypeOptions = distinctEntityTypes.map((t) => ({ label: t, value: t }));

  const windowHint = !sp.from && !sp.to ? "last 48 hours" : "custom range";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-1 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <span className="text-xs text-muted-foreground">{windowHint}</span>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Activity history for{" "}
        <span className="font-medium">{session.activeSiteName ?? session.activeSiteSlug}</span>
      </p>

      <AuditLogTable
        data={rows}
        totalCount={totalCount}
        pageSize={pageSize}
        actionOptions={actionOptions}
        entityTypeOptions={entityTypeOptions}
      />
    </div>
  );
}
