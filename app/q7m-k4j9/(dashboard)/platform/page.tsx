import Link from "next/link";
import { redirect } from "next/navigation";
import { Plug, ShieldCheck } from "lucide-react";
import { requireAdminSession } from "../components/admin-guard";
import { ModulesManager } from "./modules/modules-manager";
import { adminRoute, ADMIN_PATH } from "@/lib/admin-paths";

export default async function PlatformPage() {
  const session = await requireAdminSession();
  if (session.role !== "super_admin") {
    redirect(ADMIN_PATH);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Platform</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage platform-wide modules, integrations and permissions for all niche sites.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">Modules</h2>
        <ModulesManager />
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={adminRoute("/platform/integrations")}
          className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-blue-50 p-2 dark:bg-blue-900/20">
              <Plug className="size-5 text-blue-600 dark:text-blue-400" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:underline">
                Integrations
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Affiliate networks, analytics, email and AI providers.
              </p>
            </div>
          </div>
        </Link>

        <Link
          href={adminRoute("/platform/permissions")}
          className="group rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 shadow-sm transition-shadow hover:shadow-md"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-50 p-2 dark:bg-amber-900/20">
              <ShieldCheck
                className="size-5 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:underline">
                Permissions & Roles
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Site-scoped roles and feature-level access control.
              </p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
