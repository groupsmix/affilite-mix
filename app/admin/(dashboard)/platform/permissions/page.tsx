import { requireAdminSession } from "../../components/admin-guard";
import { PermissionsManager } from "./permissions-manager";

export default async function PermissionsPage() {
  await requireAdminSession();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Permissions & Roles</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage site-scoped role assignments. Users can have different roles per site with
          feature-level permissions.
        </p>
      </div>
      <PermissionsManager />
    </div>
  );
}
