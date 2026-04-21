import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain, allSites } from "@/config/sites";
import { validateCsrfToken, generateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { INTERNAL_HEADER, getInternalToken } from "@/lib/internal-auth";
import { generateTraceId, TRACE_ID_HEADER } from "@/lib/trace-id";

/**
 * Returns a styled "Niche not found" HTML page.
 */
function nicheNotFoundResponse(): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Niche Not Found</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; color: #1e293b; }
    .container { text-align: center; max-width: 480px; padding: 2rem; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    p { color: #64748b; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Niche Not Found</h1>
    <p>This niche site is not configured or is no longer active. If you believe this is an error, please contact support.</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
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

  // 2. For unknown domains (dashboard-managed custom domains), do async DB lookup
  //    This enables adding domains via Cloudflare Dashboard without code changes
  if (!siteId && !isLocalhostDev) {
    try {
      const dbRes = await fetch(
        new URL(`/api/internal/resolve-site?domain=${encodeURIComponent(hostname)}`, request.url),
        { headers: { [INTERNAL_HEADER]: getInternalToken() } },
      );
      if (dbRes.ok) {
        const data = await dbRes.json();
        if (data.siteId && data.isActive) {
          siteId = data.siteId;
        } else if (data.siteId && !data.isActive) {
          // Site exists but is deactivated
          return nicheNotFoundResponse();
        }
      }
    } catch {
      // DB lookup failed; fall through to 404
    }
  }

  if (!siteId) {
    return nicheNotFoundResponse();
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
