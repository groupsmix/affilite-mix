import { requireAdminSession } from "../components/admin-guard";
import { SiteManager } from "./site-manager";

export default async function SitePickerPage() {
  await requireAdminSession();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Site Management</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create, edit, and manage your niche sites. Select a site to start managing it.
        </p>
      </div>
      <SiteManager />
    </div>
  );
}
