import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth";
import { IntegrationsManager } from "./integrations-manager";

export default async function IntegrationsPage() {
  const session = await getAdminSession();
  if (!session) redirect("/q7m-k4j9/login");
  // Integrations are global platform configuration — restrict to super admins.
  if (session.role !== "super_admin") redirect("/q7m-k4j9");

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage integration providers per site. Enable or disable affiliate networks, analytics,
          email providers, and more.
        </p>
      </div>
      <IntegrationsManager />
    </div>
  );
}
