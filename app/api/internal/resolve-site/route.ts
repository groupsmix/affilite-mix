import { NextRequest, NextResponse } from "next/server";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

/** 60 resolve-site requests per minute per IP */
const RESOLVE_SITE_RATE_LIMIT = { maxRequests: 60, windowMs: 60 * 1000 };

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

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`resolve-site:${ip}`, RESOLVE_SITE_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
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
