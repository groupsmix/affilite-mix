import { NextResponse } from "next/server";
import { getAdminSession, AdminPayload } from "@/lib/auth";
import { getActiveSiteSlug } from "@/lib/active-site";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

type AdminResult =
  | { error: NextResponse; session: null; dbSiteId: null; siteSlug: null }
  | { error: null; session: AdminPayload; dbSiteId: string; siteSlug: string };

/**
 * Shared admin guard for all /api/admin/* routes.
 * - Verifies the admin JWT session exists
 * - Reads the active site from the nh_active_site cookie
 * - Resolves the database UUID for the site
 */
export async function requireAdmin(): Promise<AdminResult> {
  const session = await getAdminSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
      dbSiteId: null,
      siteSlug: null,
    };
  }

  // Read the active site from the cookie
  const siteSlug = await getActiveSiteSlug();
  if (!siteSlug) {
    return {
      error: NextResponse.json({ error: "No site selected" }, { status: 400 }),
      session: null,
      dbSiteId: null,
      siteSlug: null,
    };
  }

  const dbSiteId = await resolveDbSiteId(siteSlug);
  return { error: null, session, dbSiteId, siteSlug };
}
