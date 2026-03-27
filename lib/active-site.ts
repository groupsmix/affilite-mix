import { cookies } from "next/headers";

const ACTIVE_SITE_COOKIE = "nh_active_site";

/**
 * Read the currently selected admin site from the cookie.
 * Returns the site slug (e.g. "crypto-tools") or null if none selected.
 */
export async function getActiveSiteSlug(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_SITE_COOKIE)?.value ?? null;
}

export { ACTIVE_SITE_COOKIE };
