import { NextRequest, NextResponse } from "next/server";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { INTERNAL_HEADER, getInternalTokenFor } from "@/lib/internal-auth";
import { timingSafeCompare } from "@/lib/cron-auth";

/** 60 resolve-site requests per minute per IP */
const RESOLVE_SITE_RATE_LIMIT = { maxRequests: 60, windowMs: 60 * 1000 };

/**
 * GET /api/internal/resolve-site?domain=foo.wristnerd.xyz
 *
 * Internal endpoint used by middleware to resolve wildcard subdomains
 * to their database site record. Guarded by a shared internal header
 * to prevent external domain enumeration. Not intended for public use.
 */
export async function GET(request: NextRequest) {
  // R-13: Use purpose-specific token for internal routes.
  // Throws in production if token is missing or set to dev fallback.
  let expected: string;
  try {
    expected = getInternalTokenFor("internal");
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return NextResponse.json({ error: "Internal auth misconfigured" }, { status: 500 });
  }

  // SEC-03: Reject requests without the internal header using timing-safe
  // comparison. The previous plain `!==` leaked the token length and content
  // via timing side-channel, allowing an attacker to brute-force the
  // INTERNAL_API_TOKEN one byte at a time.
  const provided = request.headers.get(INTERNAL_HEADER) ?? "";
  const encoder = new TextEncoder();
  if (!timingSafeCompare(encoder.encode(provided), encoder.encode(expected))) {
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

  // SEC-08: Validate domain format to prevent SQL/query injection and
  // reject obviously invalid input early. A valid domain contains only
  // alphanumerics, hyphens, dots, and is reasonably short.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,253}[a-zA-Z0-9]$/.test(domain)) {
    return NextResponse.json({ error: "Invalid domain format" }, { status: 400 });
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
    // fail-open: best-effort [criticality:non-critical]
    return NextResponse.json({ error: "DB lookup failed" }, { status: 500 });
  }
}
