import { NextRequest, NextResponse } from "next/server";
import { getSiteRowByDomain } from "@/lib/dal/sites";

/**
 * GET /api/internal/resolve-site?domain=foo.writnerd.site
 *
 * Internal endpoint used by middleware to resolve wildcard subdomains
 * to their database site record. Not intended for public use.
 */
export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "domain parameter required" }, { status: 400 });
  }

  try {
    const row = await getSiteRowByDomain(domain);
    if (!row) {
      return NextResponse.json({ siteId: null, isActive: false });
    }
    return NextResponse.json({
      siteId: row.slug,
      dbId: row.id,
      isActive: row.is_active,
    });
  } catch {
    return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
  }
}
