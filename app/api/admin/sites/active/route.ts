import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin-guard";
import { getActiveSiteSlug } from "@/lib/active-site";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";

/** GET /api/admin/sites/active — return the currently selected active site ID from the httpOnly cookie */
export async function GET(request: NextRequest) {
  // Use requireAdminSession() (no site context) — this endpoint must work
  // before a site is selected (requireAdmin() demands a site cookie).
  const { error, session } = await requireAdminSession(request);
  if (error) return error;
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rlError = await enforceAdminRateLimit("sites", session);
  if (rlError) return rlError;

  const activeSiteId = await getActiveSiteSlug();
  return NextResponse.json({ activeSiteId });
}
