import { requireAdminSession } from "../../components/admin-guard";
import { IntegrationsManager } from "./integrations-manager";

export default async function IntegrationsPage() {
  await requireAdminSession();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage integration providers per site. Enable or disable affiliate networks, analytics,
          email providers, and more.
        </p>
      </div>
      <IntegrationsManager />
    </div>
  );
}
