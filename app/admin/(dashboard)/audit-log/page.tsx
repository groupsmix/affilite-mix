import { requireAdminSession } from "../components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { listAuditLogs } from "@/lib/dal/audit-log";
import { redirect } from "next/navigation";
import { LocalTime } from "../analytics/local-time";

export default async function AuditLogPage() {
  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  if (session.role !== "super_admin") {
    redirect("/admin");
  }

  const siteId = await resolveDbSiteId(session.activeSiteSlug);
  const logs = await listAuditLogs(siteId, 100);

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Audit Log</h1>
      <p className="mb-6 text-sm text-gray-500">
        Activity history for{" "}
        <span className="font-medium">{session.activeSiteName ?? session.activeSiteSlug}</span>
      </p>

      {logs.length === 0 ? (
        <p className="text-sm text-gray-400">No audit log entries yet.</p>
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
    </div>
  );
}
