import { cookies } from "next/headers";

const ACTIVE_SITE_COOKIE = "nh_active_site";

/** T-05: Defense-in-depth validation — only allow safe slug characters. */
const SLUG_RE = /^[a-z0-9-]+$/;

/**
 * Read the currently selected admin site from the cookie.
 * Returns the site slug (e.g. "crypto-tools") or null if none selected.
 */
export async function getActiveSiteSlug(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(ACTIVE_SITE_COOKIE)?.value ?? null;
  if (value && !SLUG_RE.test(value)) return null;
  return value;
}

export { ACTIVE_SITE_COOKIE };
