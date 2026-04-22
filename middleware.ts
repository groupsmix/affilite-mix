import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain, allSites } from "@/config/sites";
import { validateCsrfToken, generateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { generateTraceId, TRACE_ID_HEADER } from "@/lib/trace-id";

/**
 * Returns a redirect to the tenant-aware 404 page.
 * The app's not-found.tsx will render with proper branding and localization.
 */
function nicheNotFoundResponse(request: NextRequest): NextResponse {
  // Rewrite to the app's not-found page instead of returning inline HTML
  // This ensures tenant branding, localization, and proper SEO
  const url = request.nextUrl.clone();
  url.pathname = "/not-found";
  return NextResponse.rewrite(url, { status: 404 });
}

/**
 * Middleware: resolves domain → site_id and injects x-site-id header.
 * Supports wildcard subdomain routing — any *.wristnerd.xyz subdomain
 * is automatically resolved via DB lookup.
 * Also handles CSRF protection for state-changing API routes.
 */
export async function middleware(request: NextRequest) {
  const { pathname, hostname } = request.nextUrl;

  // ── Trailing-slash normalization (SA9) ─────────────────
  // Redirect /foo/ → /foo to prevent duplicate canonical URLs.
  // Skip the root path "/" and Next.js internals.
  if (pathname !== "/" && pathname.endsWith("/") && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/\/+$/, "");
    return NextResponse.redirect(url, 308);
  }

  // ── Resolve site ──────────────────────────────────────
  // 1. Try static config lookup first (fast, no DB call)
  let site = getSiteByDomain(hostname);
  let siteId = site?.id;

  // .localhost dev pattern inspired by https://github.com/vercel/platforms (MIT).
  // Skip the DB lookup for *.localhost in non-production — dev only, no DB calls.
  const hostWithoutPort = hostname.includes(":") ? hostname.split(":")[0] : hostname;
  const isLocalhostDev =
    process.env.NODE_ENV !== "production" &&
    (hostWithoutPort === "localhost" || hostWithoutPort.endsWith(".localhost"));

  // 2. For unknown domains (dashboard-managed custom domains), do direct DB lookup.
  //    Previous implementation used a self-fetch to /api/internal/resolve-site
  //    which added latency and coupling on the hot path.
  if (!siteId && !isLocalhostDev) {
    try {
      const row = await getSiteRowByDomain(hostname);
      if (row && row.is_active) {
        siteId = row.slug;
      } else if (row && !row.is_active) {
        return nicheNotFoundResponse(request);
      }
    } catch {
      // DB lookup failed; fall through to 404
    }
  }

  if (!siteId) {
    return nicheNotFoundResponse(request);
  }

  // ── CSRF protection for state-changing API routes ─────
  const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
  if (!SAFE_METHODS.has(request.method) && pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin") ?? "";
    const allowedOrigins = getAllowedOrigins(hostname);

    // 1. If Origin is present, reject mismatched origins immediately
    if (origin && !allowedOrigins.includes(origin)) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    // 2. Always validate the CSRF double-submit cookie token
    //    (regardless of whether Origin is present)
    //    Auth endpoints are exempt: csrf (token issuer), login (pre-auth),
    //    refresh (background keep-alive).
    //    NOTE: logout is NOT exempt — CSRF protection prevents forced-logout attacks.
    const csrfExemptPaths = new Set([
      "/api/auth/csrf",
      "/api/auth/login",
      "/api/auth/refresh",
      // Cron/webhook endpoints called externally without CSRF cookies
      "/api/cron/publish",
      "/api/cron/ai-generate",
      "/api/cron/sitemap-refresh",
      "/api/revalidate",
      // Public endpoints using sendBeacon() which cannot send custom headers
      "/api/track/click",
      "/api/vitals",
      "/api/track/impression",
      // Unsubscribe: the per-subscriber unsubscribe_token is the auth factor
      // (GET uses query param, POST requires it in the body), so CSRF
      // double-submit is not needed — the token already proves intent.
      "/api/newsletter/unsubscribe",
    ]);
    if (!csrfExemptPaths.has(pathname)) {
      const cookieValue = request.cookies.get(CSRF_COOKIE)?.value;
      const headerValue = request.headers.get(CSRF_HEADER) ?? undefined;
      if (!validateCsrfToken(cookieValue, headerValue)) {
        return new NextResponse("Forbidden – missing CSRF token", { status: 403 });
      }
    }
  }

  // ── Inject x-site-id and trace-id headers into request ──
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-site-id", siteId);

  // Generate a trace ID for request correlation across logs/Sentry/downstream calls.
  // Reuse an existing x-trace-id (from an upstream proxy) or cf-ray; otherwise mint a new one.
  const traceId =
    request.headers.get(TRACE_ID_HEADER) ?? request.headers.get("cf-ray") ?? generateTraceId();
  requestHeaders.set(TRACE_ID_HEADER, traceId);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Echo the trace ID on the response so clients/devtools can correlate.
  response.headers.set(TRACE_ID_HEADER, traceId);

  // ── CSRF token rotation on state-changing requests ──────
  // Rotate the CSRF token after every successful state-changing request
  // for defence-in-depth (one-time-use tokens).
  if (!SAFE_METHODS.has(request.method) && pathname.startsWith("/api/")) {
    const newToken = generateCsrfToken();
    response.cookies.set(CSRF_COOKIE, newToken, {
      httpOnly: true,
      secure: IS_SECURE_COOKIE,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 4,
    });
    response.headers.set("x-csrf-token-refreshed", newToken);
  }

  return response;
}

function getAllowedOrigins(requestHostname?: string): string[] {
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
  // Allow the current request hostname (covers wildcard subdomains resolved via DB)
  if (requestHostname) {
    origins.push(`https://${requestHostname}`);
    origins.push(`http://${requestHostname}`);
  }
  // Allow localhost for dev (common ports)
  if (process.env.NODE_ENV === "development") {
    origins.push("http://localhost:3000");
    origins.push("http://localhost:3001");
  }
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
     * - /api/internal/* (internal APIs called by middleware itself)
     */
    "/((?!_next/static|_next/image|favicon.ico|fonts/|api/internal/).*)",
  ],
};
