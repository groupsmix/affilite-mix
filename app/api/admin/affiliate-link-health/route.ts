import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-guard";
import { listUnhealthyAffiliateLinks } from "@/lib/dal/affiliate-link-health";

export async function GET(request: NextRequest) {
  const { error, dbSiteId } = await requireAdmin(request);
  if (error) return error;
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const rawOffset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 50;
  const offset = Number.isFinite(rawOffset) ? Math.floor(rawOffset) : 0;
  try {
    const links = await listUnhealthyAffiliateLinks(dbSiteId, { limit, offset });
    return NextResponse.json({
      links,
      limit: Math.min(Math.max(limit, 1), 100),
      offset: Math.min(Math.max(offset, 0), 100_000),
    });
  } catch {
    return NextResponse.json({ error: "Failed to list affiliate link health" }, { status: 500 });
  }
}
