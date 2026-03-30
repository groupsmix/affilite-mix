import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain, allSites } from "@/config/sites";
import { validateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";

/**
 * Middleware: resolves domain → site_id and injects x-site-id header.
 * Also handles CSRF protection for state-changing API routes using both
 * Origin validation and a double-submit cookie fallback.
 */
export function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;

  // ── Resolve site ──────────────────────────────────────
  const site = getSiteByDomain(hostname);
  const siteId = site?.id;

  if (!siteId) {
    return new NextResponse("Site not found", { status: 404 });
  }

  // ── CSRF protection for state-changing API routes ─────
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  if (!SAFE_METHODS.has(request.method) && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin") ?? "";
    const allowedOrigins = getAllowedOrigins();

    // 1. If Origin is present, reject mismatched origins immediately
    if (origin && !allowedOrigins.includes(origin)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // 2. Always validate the CSRF double-submit cookie token
    //    (regardless of whether Origin is present)
    //    Auth endpoints are exempt: csrf (token issuer), login (pre-auth),
    //    logout (must always succeed), refresh (background keep-alive).
    const csrfExemptPaths = new Set([
      "/api/auth/csrf",
      "/api/auth/login",
      "/api/auth/logout",
      "/api/auth/refresh",
    ]);
    if (!csrfExemptPaths.has(pathname)) {
      const cookieValue = request.cookies.get(CSRF_COOKIE)?.value;
      const headerValue = request.headers.get(CSRF_HEADER) ?? undefined;
      if (!validateCsrfToken(cookieValue, headerValue)) {
        return new NextResponse("Forbidden – missing CSRF token", { status: 403 });
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
