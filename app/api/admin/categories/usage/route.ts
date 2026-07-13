import { NextRequest, NextResponse } from "next/server";
import { getCategoryUsageCounts } from "@/lib/dal/categories";
import { withAuthz } from "@/lib/authz";
import { enforceAdminRateLimit } from "@/lib/admin-rate-limit";
import { getTenantClientForSite } from "@/lib/supabase-server";

/** GET /api/admin/categories/usage?id=... — get usage counts for a category */
export const GET = withAuthz(
  "categories",
  "view",
  async (request: NextRequest, { session, siteId }) => {
    const rlResponse = await enforceAdminRateLimit("categories-usage", session);
    if (rlResponse) return rlResponse;

    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const getClient = () => getTenantClientForSite(siteId, session.userId);
    const counts = await getCategoryUsageCounts(siteId, id, getClient);
    return NextResponse.json(counts);
  },
);
