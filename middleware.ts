import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain, allSites } from "@/config/sites";
import { validateCsrfToken, generateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { generateTraceId, TRACE_ID_HEADER } from "@/lib/trace-id";
import { buildCspHeader, generateCspNonce, NONCE_HEADER } from "@/lib/csp";
import { captureException } from "@/lib/sentry";

const CSP_HEADER = "Content-Security-Policy";

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
    // Use new URL() pattern to properly preserve query strings
    const url = new URL(request.url);
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

  // Generate a trace ID for request correlation across logs/Sentry/downstream calls.
  // Reuse an existing x-trace-id (from an upstream proxy) or cf-ray; otherwise mint a new one.
  // We do this early so we can log it if the DB lookup fails.
  let traceId = request.headers.get(TRACE_ID_HEADER) ?? request.headers.get("cf-ray");
  if (!traceId || !/^[A-Za-z0-9_-]{8,64}$/.test(traceId)) {
    traceId = generateTraceId();
  }

  // 2. For unknown domains (dashboard-managed custom domains), do direct DB lookup.
  //    Previous implementation used a self-fetch to /api/internal/resolve-site
  //    which added latency and coupling on the hot path.
  if (!siteId && !isLocalhostDev) {
    try {
      const cacheKey = `site-domain:${hostname}`;
      let cachedRow = null;
      try {
        const kv = (process.env as any).APP_CACHE_KV as any;
        if (kv) cachedRow = await kv.get(cacheKey, "json");
      } catch (e) {}

      const row = cachedRow || (await getSiteRowByDomain(hostname));
      if (row && !cachedRow) {
        try {
          const kv = (process.env as any).APP_CACHE_KV as any;
          if (kv) await kv.put(cacheKey, JSON.stringify(row), { expirationTtl: 60 });
        } catch (e) {}
      }
      if (row && row.is_active) {
        siteId = row.slug;
      } else if (row && !row.is_active) {
        return nicheNotFoundResponse(request);
      }
    } catch (err) {
      // F-025: Log structured error with trace id and emit Sentry instead of silent failure
      console.error(`[middleware] DB lookup failed for domain: ${hostname}`, { traceId, err });
      captureException(err, {
        context: "[middleware] getSiteRowByDomain",
        extra: { hostname, traceId },
      });

      // Serve a branded temporary unavailable response rather than a confusing 404
      return new NextResponse(
        JSON.stringify({
          error: "Service Temporarily Unavailable",
          message: "The platform is currently experiencing database connectivity issues.",
          traceId,
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
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
    //    Auth endpoints exempt: csrf (token issuer), refresh (background
    //    keep-alive — sameSite=Strict on the auth cookie covers session
    //    fixation here).
    //    NOTE: logout is NOT exempt — CSRF protection prevents forced-logout attacks.
    //    NOTE: login is NOT exempt (F-10) — login CSRF / session fixation
    //    via attacker-controlled credentials is prevented by requiring a
    //    one-shot CSRF token issued via /api/auth/csrf. The admin login
    //    page already uses fetchWithCsrf() to obtain and send the token.
    const csrfExemptPaths = new Set([
      "/api/auth/csrf",
      "/api/auth/refresh",
      "/api/membership/webhook",
      "/api/revalidate",
      // Public endpoints using sendBeacon() which cannot send custom headers
      "/api/track/click",
      "/api/vitals",
      "/api/track/impression",
      // Browser-automated CSP violation reports — cannot carry CSRF tokens
      "/api/csp-report",
      // F-028: Cloudflare Queue consumer for click tracking — authenticated
      // via Bearer INTERNAL_API_TOKEN from the Worker, not via CSRF cookies.
      "/api/queue/clicks",
      // Unsubscribe: the per-subscriber unsubscribe_token is the auth factor
      // (GET uses query param, POST requires it in the body), so CSRF
      // double-submit is not needed — the token already proves intent.
      "/api/newsletter/unsubscribe",
    ]);
    
    // F-043: Cron endpoints are authenticated via Bearer CRON_SECRET, 
    // so we exempt the entire /api/cron/ prefix instead of hard-coding each route.
    const isExempt = csrfExemptPaths.has(pathname) || pathname.startsWith("/api/cron/");
    
    if (!isExempt) {
      const cookieValue = request.cookies.get(CSRF_COOKIE)?.value;
      const headerValue = request.headers.get(CSRF_HEADER) ?? undefined;
      if (!validateCsrfToken(cookieValue, headerValue)) {
        return new NextResponse("Forbidden – missing CSRF token", { status: 403 });
      }
    }
  }

  // ── Inject x-site-id and trace-id headers into request ──
  const requestHeaders = new Headers(request.headers);
  if (siteId) {
    requestHeaders.set("x-site-id", siteId);
  }

  requestHeaders.set(TRACE_ID_HEADER, traceId);

  // ── CSP nonce generation (H-10) ─────────────────────
  // Generate a fresh nonce for every HTML request.  We only bother for
  // non-API routes — the /api/* responses are typically JSON and have no
  // inline scripts/styles to protect, so the static CSP from next.config.ts
  // still covers them without an extra per-request allocation.
  const isApiRoute = pathname.startsWith("/api/");
  let nonce: string | null = null;
  let cspHeaderValue: string | null = null;
  if (!isApiRoute) {
    nonce = generateCspNonce();
    cspHeaderValue = buildCspHeader(nonce);
    requestHeaders.set(NONCE_HEADER, nonce);
    // Next.js reads CSP from the *request* headers to automatically
    // propagate the nonce to its own inline runtime scripts.  See:
    // https://nextjs.org/docs/app/guides/content-security-policy
    requestHeaders.set(CSP_HEADER, cspHeaderValue);
  }

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Echo the trace ID on the response so clients/devtools can correlate.
  response.headers.set(TRACE_ID_HEADER, traceId);

  if (cspHeaderValue) {
    // Actual browser enforcement is driven by the *response* header.
    response.headers.set(CSP_HEADER, cspHeaderValue);
  }

  // Removed CSRF token rotation on state-changing requests
  // to support concurrent POST requests and prevent token exposure in response headers.

  return response;
}

function getAllowedOrigins(requestHostname?: string): string[] {
  const origins: string[] = [];
  for (const site of allSites) {
    origins.push(`https://${site.domain}`);
    if (site.aliases) {
      for (const alias of site.aliases) {
        origins.push(`https://${alias}`);
      }
    }
  }
  // Allow the current request hostname (covers wildcard subdomains resolved via DB)
  if (requestHostname) {
    origins.push(`https://${requestHostname}`);
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
