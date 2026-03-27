import { getAdminSession } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { getSiteById } from "@/config/sites";
import { redirect } from "next/navigation";

/**
 * Server component guard: redirects to login if not authenticated.
 * Returns the admin session payload along with the active site info.
 */
export async function requireAdminSession() {
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  const activeSiteSlug = await getActiveSiteSlug();
  const activeSite = activeSiteSlug ? getSiteById(activeSiteSlug) : null;

  return { ...session, activeSiteSlug, activeSiteName: activeSite?.name ?? null };
}
