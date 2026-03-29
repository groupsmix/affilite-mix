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
  // 1. Validates the Origin header against the list of known site domains.
  // 2. When Origin is missing, falls back to double-submit cookie:
  //    compares the x-csrf-token header with the nh_csrf cookie value.
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  if (!SAFE_METHODS.has(request.method) && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin") ?? "";
    const allowedOrigins = getAllowedOrigins();

    if (origin) {
      // Origin header present — validate it
      if (!allowedOrigins.includes(origin)) {
        return new NextResponse("Forbidden", { status: 403 });
      }
    } else {
      // No Origin header — fall back to double-submit cookie check
      const csrfHeader = request.headers.get("x-csrf-token") ?? "";
      const csrfCookie = request.cookies.get("nh_csrf")?.value ?? "";
      if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
        return new NextResponse("Forbidden — CSRF token mismatch", { status: 403 });
      }
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
