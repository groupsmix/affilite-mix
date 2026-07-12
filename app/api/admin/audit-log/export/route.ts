import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { requireAdmin, assertRole } from "@/lib/admin-guard";
import { listAuditLogs } from "@/lib/dal/audit-log";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { captureException } from "@/lib/sentry";

const BATCH_SIZE = 200;
const MAX_EXPORT_ROWS = 100_000;

function parseCsvString(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((v) => v.length > 0);
}

function toIsoOrUndefined(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildCsv(rows: Awaited<ReturnType<typeof listAuditLogs>>): string {
  const header = [
    "id",
    "created_at",
    "actor",
    "action",
    "entity_type",
    "entity_id",
    "ip",
    "details",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const details =
      typeof row.details === "object" ? JSON.stringify(row.details) : String(row.details ?? "");
    lines.push(
      [
        csvEscape(row.id),
        csvEscape(row.created_at),
        csvEscape(row.actor),
        csvEscape(row.action),
        csvEscape(row.entity_type),
        csvEscape(row.entity_id),
        csvEscape(row.ip),
        csvEscape(details),
      ].join(","),
    );
  }
  return lines.join("\n");
}

/**
 * GET /api/admin/audit-log/export
 *
 * Exports the audit log for the active site as a CSV. The query uses the same
 * filter parameters as the audit-log page (f.action, f.entity_type, actor,
 * q, from, to) and streams the rows in batches. The endpoint is super_admin-only
 * and uses the privileged client because audit_log SELECT is restricted to
 * service_role.
 */
export async function GET(request: NextRequest) {
  const { error, session, dbSiteId } = await requireAdmin();
  if (error) return error;

  const forbidden = assertRole(session, "super_admin");
  if (forbidden) return forbidden;
  const searchParams = request.nextUrl.searchParams;

  const actions = parseCsvString(searchParams.get("f.action"));
  const entityTypes = parseCsvString(searchParams.get("f.entity_type"));
  const q = searchParams.get("q")?.trim() || undefined;
  const actor = searchParams.get("actor")?.trim() || undefined;
  const from = toIsoOrUndefined(searchParams.get("from"));
  const to = toIsoOrUndefined(searchParams.get("to"));

  const filters = {
    actions: actions.length > 0 ? actions : undefined,
    entityTypes: entityTypes.length > 0 ? entityTypes : undefined,
    actor,
    q,
    from,
    to,
  };

  const getAuditClient = () => getPrivilegedSupabaseClient("api/admin/audit-log/export");

  const rows: Awaited<ReturnType<typeof listAuditLogs>> = [];
  let offset = 0;
  try {
    while (offset < MAX_EXPORT_ROWS) {
      const batch = await listAuditLogs(dbSiteId, BATCH_SIZE, offset, filters, getAuditClient);
      rows.push(...batch);
      if (batch.length < BATCH_SIZE) break;
      offset += BATCH_SIZE;
    }
  } catch (err) {
    captureException(err, { context: "[api/admin/audit-log/export] failed to fetch rows" });
    return NextResponse.json({ error: "Failed to export audit log" }, { status: 500 });
  }

  const csv = buildCsv(rows);
  const site = dbSiteId.slice(0, 8);
  const filename = `audit-log-${site}-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
