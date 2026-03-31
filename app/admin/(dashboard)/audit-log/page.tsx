import { requireAdminSession } from "../components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { listAuditLogs, getDistinctActions } from "@/lib/dal/audit-log";
import { redirect } from "next/navigation";
import { LocalTime } from "../analytics/local-time";

interface AuditLogSearchParams {
  action?: string;
  actor?: string;
  entity_type?: string;
  page?: string;
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<AuditLogSearchParams>;
}) {
  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  if (session.role !== "super_admin") {
    redirect("/admin");
  }

  const params = await searchParams;
  const siteId = await resolveDbSiteId(session.activeSiteSlug);
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 50;
  const offset = (page - 1) * pageSize;

  const [logs, actions] = await Promise.all([
    listAuditLogs(siteId, pageSize, offset, {
      action: params.action,
      actor: params.actor,
      entityType: params.entity_type,
    }),
    getDistinctActions(siteId),
  ]);

  /** Build a filtered URL preserving other query params */
  function filterUrl(key: string, value: string | undefined): string {
    const sp = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      action: params.action,
      actor: params.actor,
      entity_type: params.entity_type,
    };
    current[key] = value;
    for (const [k, v] of Object.entries(current)) {
      if (v) sp.set(k, v);
    }
    const qs = sp.toString();
    return `/admin/audit-log${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Audit Log</h1>
      <p className="mb-4 text-sm text-gray-500">
        Activity history for{" "}
        <span className="font-medium">{session.activeSiteName ?? session.activeSiteSlug}</span>
      </p>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {actions.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">Action:</span>
            <div className="flex flex-wrap gap-1">
              <a
                href={filterUrl("action", undefined)}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${!params.action ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              >
                All
              </a>
              {actions.map((a) => (
                <a
                  key={a}
                  href={filterUrl("action", a)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${params.action === a ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                >
                  {a}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {logs.length === 0 ? (
        <p className="text-sm text-gray-400">No audit log entries found.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-gray-50">
                  <td className="whitespace-nowrap px-4 py-2 text-gray-400">
                    <LocalTime dateTime={log.created_at} />
                  </td>
                  <td className="px-4 py-2 text-gray-700">{log.actor}</td>
                  <td className="px-4 py-2">
                    <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {log.entity_type}
                    {log.entity_id && (
                      <span className="ml-1 text-gray-400">#{log.entity_id.slice(0, 8)}</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 text-xs text-gray-400">
                    {Object.keys(log.details).length > 0
                      ? JSON.stringify(log.details)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {(page > 1 || logs.length === pageSize) && (
        <div className="mt-4 flex items-center justify-between">
          {page > 1 ? (
            <a
              href={filterUrl("page", String(page - 1))}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Previous
            </a>
          ) : (
            <span />
          )}
          <span className="text-xs text-gray-400">Page {page}</span>
          {logs.length === pageSize ? (
            <a
              href={filterUrl("page", String(page + 1))}
              className="rounded-md bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200"
            >
              Next
            </a>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
