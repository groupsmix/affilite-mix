import { NextRequest, NextResponse } from "next/server";
import { getSiteRowByDomain } from "@/lib/dal/sites";

/**
 * Internal header shared between middleware and this endpoint.
 * Not a cryptographic secret — just prevents casual external access.
 * The endpoint is already excluded from the middleware matcher, so this
 * header acts as a lightweight guard against direct public enumeration.
 */
const INTERNAL_HEADER = "x-internal-token";
const INTERNAL_TOKEN = "__affilite_internal__";

/**
 * GET /api/internal/resolve-site?domain=foo.writnerd.site
 *
 * Internal endpoint used by middleware to resolve wildcard subdomains
 * to their database site record. Guarded by a shared internal header
 * to prevent external domain enumeration. Not intended for public use.
 */
export async function GET(request: NextRequest) {
  // Reject requests without the internal header
  if (request.headers.get(INTERNAL_HEADER) !== INTERNAL_TOKEN) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const domain = request.nextUrl.searchParams.get("domain");
  if (!domain) {
    return NextResponse.json({ error: "domain parameter required" }, { status: 400 });
  }

  try {
    const row = await getSiteRowByDomain(domain);
    if (!row) {
      return NextResponse.json({ siteId: null, isActive: false });
    }
    // Only expose the slug and active status — the internal database UUID
    // is not needed by middleware and would leak implementation details.
    return NextResponse.json({
      siteId: row.slug,
      isActive: row.is_active,
    });
  } catch {
    return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
  }
}
