import { requireAdminSession } from "../components/admin-guard";
import { allSites } from "@/config/sites";
import { SiteCard } from "./site-card";

export default async function SitePickerPage() {
  await requireAdminSession();

  const sites = allSites.map((s) => ({
    id: s.id,
    name: s.name,
    domain: s.domain,
    niche: s.brand.niche,
  }));

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Select a Site</h1>
      <p className="mb-8 text-sm text-gray-500">
        Choose which business you want to manage.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {sites.map((site) => (
          <SiteCard key={site.id} site={site} />
        ))}
      </div>
    </div>
  );
}
