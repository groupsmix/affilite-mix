import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getAdminSession, AdminPayload } from "@/lib/auth";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";

interface AdminContext {
  session: AdminPayload;
  dbSiteId: string;
}

type AdminResult =
  | { error: NextResponse; session: null; dbSiteId: null }
  | { error: null; session: AdminPayload; dbSiteId: string };

/**
 * Shared admin guard for all /api/admin/* routes.
 * - Verifies the admin JWT session exists
 * - Validates that the JWT siteId matches the x-site-id header from middleware
 * - Resolves the database UUID for the site
 */
export async function requireAdmin(): Promise<AdminResult> {
  const session = await getAdminSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      session: null,
      dbSiteId: null,
    };
  }

  // Validate that the JWT siteId matches the site determined by middleware
  const headerList = await headers();
  const requestSiteSlug = headerList.get("x-site-id");
  if (requestSiteSlug && session.siteId !== requestSiteSlug) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      session: null,
      dbSiteId: null,
    };
  }

  const dbSiteId = await resolveDbSiteId(session.siteId);
  return { error: null, session, dbSiteId };
}
