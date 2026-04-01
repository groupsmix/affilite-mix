import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { getSiteById } from "@/config/sites";
import { getSiteRowBySlug } from "@/lib/dal/sites";
import { redirect } from "next/navigation";

/**
 * Server component guard: redirects to login if not authenticated.
 * Returns the admin session payload along with the active site info.
 * Supports both static-config sites and DB-only sites created via admin panel.
 */
export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const activeSiteSlug = await getActiveSiteSlug();
  let activeSiteName: string | null = null;

  if (activeSiteSlug) {
    const staticSite = getSiteById(activeSiteSlug);
    if (staticSite) {
      activeSiteName = staticSite.name;
    } else {
      // DB-only site — fetch name from database
      const dbSite = await getSiteRowBySlug(activeSiteSlug);
      activeSiteName = dbSite?.name ?? null;
    }
  }

  return { ...session, activeSiteSlug, activeSiteName };
}
