import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { PermissionsManager } from "./permissions-manager";

export default async function PermissionsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/q7m-k4j9/login");
  // Only super_admin may manage roles — a regular admin hitting this page
  // gets a hard redirect rather than a confusing partial state where all
  // API calls return 403.
  if (session.role !== "super_admin") redirect("/q7m-k4j9");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Permissions & Roles</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage site-scoped role assignments. Users can have different roles per site with
          feature-level permissions.
        </p>
      </div>
      <PermissionsManager />
    </div>
  );
}
