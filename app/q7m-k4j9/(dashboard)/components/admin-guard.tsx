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
    redirect("/q7m-k4j9/login");
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

/**
 * Like requireAdminSession, but also redirects to the site-picker with an
 * explanatory flag (?needsSite=1) when no active site has been selected.
 *
 * Use this on every dashboard page that requires a site context (analytics,
 * products, ads, content, etc.).  The SiteManager reads the flag and shows
 * a toast explaining why the user was redirected.
 *
 * NOTE: the individual `if (!session.activeSiteSlug) redirect(...)` guards in
 * existing pages are left in place for now so this helper can be adopted
 * incrementally — they remain a safe no-op fallback.
 */
export async function requireAdminSessionWithSite() {
  const session = await requireAdminSession();
  if (!session.activeSiteSlug) {
    redirect("/q7m-k4j9/sites?needsSite=1");
  }
  // Narrow: activeSiteSlug is non-null past this point.
  return session as typeof session & { activeSiteSlug: string };
}
