import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain, allSites } from "@/config/sites";

/**
 * Middleware: resolves domain → site_id and injects x-site-id header.
 * Also handles CSRF protection for state-changing API routes.
 */
export function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;

  // ── Resolve site ──────────────────────────────────────
  const siteOverride = process.env.SITE_OVERRIDE;
  let siteId: string | undefined;

  if (siteOverride) {
    // Local dev: use env override
    siteId = siteOverride;
  } else {
    const site = getSiteByDomain(hostname);
    siteId = site?.id;
  }

  if (!siteId) {
    return new NextResponse("Site not found", { status: 404 });
  }

  // ── CSRF protection for state-changing API routes ─────
  // Validates the Origin header against the list of known site domains.
  // NOTE: Some clients/proxies may omit the Origin header entirely. When
  // Origin is missing the request is currently allowed through. For
  // stronger protection, consider adding a token-based CSRF mechanism
  // (e.g. double-submit cookie) as a defence-in-depth fallback.
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  if (!SAFE_METHODS.has(request.method) && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin") ?? "";
    const allowedOrigins = getAllowedOrigins();
    if (origin && !allowedOrigins.includes(origin)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  // ── Inject x-site-id header into request ──────────────
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-site-id", siteId);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

function getAllowedOrigins(): string[] {
  const origins: string[] = [];
  for (const site of allSites) {
    origins.push(`https://${site.domain}`);
    origins.push(`http://${site.domain}`);
    if (site.aliases) {
      for (const alias of site.aliases) {
        origins.push(`https://${alias}`);
        origins.push(`http://${alias}`);
      }
    }
  }
  // Allow localhost for dev
  origins.push("http://localhost:3000");
  return origins;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    "/((?!_next/static|_next/image|favicon.ico|fonts/).*)",
  ],
};
