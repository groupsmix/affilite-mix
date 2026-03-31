import { requireAdminSession } from "../components/admin-guard";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { listAdPlacements } from "@/lib/dal/ad-placements";
import { redirect } from "next/navigation";
import { AdPlacementList } from "./ad-placement-list";

export default async function AdsPage() {
  const session = await requireAdminSession();

  if (!session.activeSiteSlug) {
    redirect("/admin/sites");
  }

  const siteId = await resolveDbSiteId(session.activeSiteSlug);
  const placements = await listAdPlacements(siteId);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ad Placements</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage ad slots for sites monetized with ads.
          </p>
        </div>
      </div>

      <AdPlacementList placements={placements} />
    </div>
  );
}
