import { requireAdminSession } from "../../components/admin-guard";
import { ModulesManager } from "./modules-manager";

export default async function ModulesPage() {
  await requireAdminSession();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Module Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Enable or disable modules per site. Modules control which features are available on each
          niche site.
        </p>
      </div>
      <ModulesManager />
    </div>
  );
}
