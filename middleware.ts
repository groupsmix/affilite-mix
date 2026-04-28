import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain } from "@/config/sites";
import { validateCsrfToken, generateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { generateTraceId, TRACE_ID_HEADER } from "@/lib/trace-id";
import { buildCspHeader, generateCspNonce, NONCE_HEADER } from "@/lib/csp";
import { captureException } from "@/lib/sentry";
import { CRON_PATH_PREFIX } from "@/lib/cron-registry";
import { csrfExemptPaths } from "@/lib/security/csrf-exempt-registry";
import { getAllowedOrigins } from "@/lib/security/allowed-origins";
import { checkRateLimit } from "@/lib/rate-limit";

const CSP_HEADER = "Content-Security-Policy";

// F-PERF-02: Per-isolate maintenance mode cache (30s TTL)
let _maintenanceCacheValue = false;
let _maintenanceCacheExpiry = 0;

/** Methods allowed via CORS for public API endpoints (beacon, vitals, etc.) */
const CORS_ALLOWED_METHODS = "GET, POST, OPTIONS";
/** Headers the browser is allowed to send on cross-origin requests */
const CORS_ALLOWED_HEADERS = [CSRF_HEADER, "Content-Type", "Authorization", TRACE_ID_HEADER].join(
  ", ",
);
/** Preflight cache duration: 1 hour */
const CORS_MAX_AGE = "3600";

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

  // ── Maintenance mode (A-023 / F-PERF-02) ──────────────
  // Checked early so every route (including API) can be taken offline
  // without redeploying. Supports both an env var and a KV flag.
  // F-PERF-02: KV lookups are memoised per-isolate with a 30s TTL
  // to avoid per-request KV reads.
  if (pathname !== "/api/health" && pathname !== "/api/csp-report") {
    const maintenanceMode =
      process.env.APP_MAINTENANCE_MODE === "1" || process.env.APP_MAINTENANCE_MODE === "true";
    if (maintenanceMode) {
      return new NextResponse(JSON.stringify({ error: "Service temporarily unavailable." }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }
    try {
      if (_maintenanceCacheExpiry < Date.now()) {
        const kv = (process.env as any).APP_CACHE_KV as any;
        if (kv) {
          const kvMaintenance = await kv.get("maintenance_mode");
          _maintenanceCacheValue = kvMaintenance === "1" || kvMaintenance === "true";
        }
        _maintenanceCacheExpiry = Date.now() + 30_000;
      }
      if (_maintenanceCacheValue) {
        return new NextResponse(JSON.stringify({ error: "Service temporarily unavailable." }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch {
      // Ignore KV errors; maintenance gate is best-effort.
    }
  }

  // ── Trailing-slash normalization (SA9) ─────────────────
  // Redirect /foo/ → /foo to prevent duplicate canonical URLs.
  // Skip the root path "/" and Next.js internals.
  if (pathname !== "/" && pathname.endsWith("/") && !pathname.startsWith("/api/")) {
    // Use new URL() pattern to properly preserve query strings
    const url = new URL(request.url);
    url.pathname = pathname.replace(/\/+$/, "");
    return NextResponse.redirect(url, 308);
  }

  // ── CORS preflight (OPTIONS) ───────────────────────────
  // Respond to preflight requests early with the correct allow-list.
  // Only allow origins that match known tenant domains — never wildcard.
  // F-008: at preflight time we have not yet run the DB site lookup,
  // so we trust the request hostname only if it appears in static
  // `allSites` config; otherwise the allow-list falls back to the
  // static set alone. Custom DB-registered domains will resolve
  // their preflight from the static set or the cached site row that
  // was minted during the previous request.
  if (request.method === "OPTIONS" && pathname.startsWith("/api/")) {
    const requestOrigin = request.headers.get("origin") ?? "";
    const isStaticConfigured = Boolean(getSiteByDomain(hostname));
    const allowedOrigins = getAllowedOrigins(isStaticConfigured ? hostname : undefined);
    const matchedOrigin =
      requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : "";

    if (!matchedOrigin) {
      return new NextResponse(null, { status: 403 });
    }

    return new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": matchedOrigin,
        "Access-Control-Allow-Methods": CORS_ALLOWED_METHODS,
        "Access-Control-Allow-Headers": CORS_ALLOWED_HEADERS,
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Max-Age": CORS_MAX_AGE,
        Vary: "Origin",
      },
    });
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
  //
  //    F-007: bot floods sending random Host: headers would force a
  //    Supabase lookup for every unknown hostname. We negative-cache
  //    "no such site" responses for 5 minutes so repeated hits land
  //    entirely at the edge after the first DB miss.
  if (!siteId && !isLocalhostDev) {
    // FIX-08 (F-006): Per-IP rate limit on hostname resolution before DB hit.
    // Bot floods sending random Host: headers force a Supabase lookup per
    // request. The negative cache helps after the first hit, but the first
    // wave still reaches the DB. Cap at 30 hostname resolutions per IP per
    // minute — legitimate users with a few tabs open won't hit this.
    try {
      const clientIp = request.headers.get("cf-connecting-ip") ?? "unknown";
      const rlResult = await checkRateLimit(`hostname-resolve:${clientIp}`, {
        maxRequests: 30,
        windowMs: 60_000,
        failPolicy: "closed",
      });
      if (!rlResult.allowed) {
        return new Response("Too Many Requests", { status: 429 });
      }
    } catch {
      // Rate limit check itself failed — allow the request through rather
      // than blocking all unknown-hostname traffic.
    }

    try {
      const cacheKey = `site-domain:${hostname}`;
      const negativeCacheKey = `site-domain-miss:${hostname}`;
      let cachedRow: { id?: string; slug?: string; is_active?: boolean } | null = null;
      let isNegativeCached = false;
      try {
        const kv = (process.env as any).APP_CACHE_KV as any;
        if (kv) {
          // Check negative cache first — short-circuits the DB lookup
          // entirely for hostnames we've already seen as unknown.
          const negative = await kv.get(negativeCacheKey);
          if (negative === "1") {
            isNegativeCached = true;
          } else {
            cachedRow = await kv.get(cacheKey, "json");
          }
        }
      } catch (e) {}

      if (isNegativeCached) {
        return nicheNotFoundResponse(request);
      }

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
      } else if (!row) {
        // Negative-cache the unknown hostname for 5 minutes so a flood
        // of bot traffic with random Host headers does not hammer the
        // DB. 5 minutes is short enough that legitimate domain
        // onboarding still propagates promptly.
        try {
          const kv = (process.env as any).APP_CACHE_KV as any;
          if (kv) await kv.put(negativeCacheKey, "1", { expirationTtl: 300 });
        } catch (e) {}
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
    //
    //    The exempt set is defined in lib/security/csrf-exempt-registry.ts
    //    so every entry is paired with a documented compensating-control
    //    list and a security CODEOWNER. Cron paths are still exempted
    //    via the prefix below — every cron route's per-trigger Bearer
    //    secret comes from lib/cron-registry.ts.
    const isExempt = csrfExemptPaths().has(pathname) || pathname.startsWith(CRON_PATH_PREFIX);

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

  // FIX-10 (F-019, F-012): Vary headers to prevent cache poisoning.
  // Cookie: responses differ based on admin session / active site cookie.
  // x-site-id, host: responses differ based on the resolved tenant.
  // Without these, a CDN or reverse proxy could serve an admin response
  // to an unauthenticated user, or serve site-A content under site-B's URL.
  response.headers.append("Vary", "Cookie");
  response.headers.append("Vary", "x-site-id, host");

  // ── CORS response headers ──────────────────────────────
  // Reflect the requesting origin if it is in the tenant allow-list.
  // Never use wildcard "*" — all endpoints may carry credentials.
  if (isApiRoute) {
    const requestOrigin = request.headers.get("origin") ?? "";
    if (requestOrigin) {
      const allowedOrigins = getAllowedOrigins(hostname);
      if (allowedOrigins.includes(requestOrigin)) {
        response.headers.set("Access-Control-Allow-Origin", requestOrigin);
        response.headers.set("Access-Control-Allow-Credentials", "true");
      }
    }
    // Always set Vary: Origin so CDN/browser caches key on the origin.
    response.headers.append("Vary", "Origin");
  }

  if (cspHeaderValue) {
    // Actual browser enforcement is driven by the *response* header.
    response.headers.set(CSP_HEADER, cspHeaderValue);
  }

  // Removed CSRF token rotation on state-changing requests
  // to support concurrent POST requests and prevent token exposure in response headers.

  return response;
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
