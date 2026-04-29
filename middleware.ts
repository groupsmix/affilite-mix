import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain } from "@/config/sites";
import { validateCsrfToken, generateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";
import { IS_SECURE_COOKIE } from "@/lib/cookie-utils";
import { getSiteRowByDomain } from "@/lib/dal/sites";
import { generateTraceId, TRACE_ID_HEADER } from "@/lib/trace-id";
import { buildCspHeader, generateCspNonce, NONCE_HEADER, buildReportToHeader } from "@/lib/csp";
import { captureException } from "@/lib/sentry";
import { CRON_PATH_PREFIX } from "@/lib/cron-registry";
import { csrfExemptPaths } from "@/lib/security/csrf-exempt-registry";
import { getAllowedOrigins, type VerifiedSiteRef } from "@/lib/security/allowed-origins";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getNegativeCacheTtlSeconds,
  recordUnknownHostKvAccess,
} from "@/lib/security/unknown-host-guard";
import { getAppCacheKV } from "@/lib/runtime-env";

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
async function innerMiddleware(request: NextRequest) {
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
        headers: {
          "Content-Type": "application/json",
          // G-35: never let a CDN, browser, or shared proxy cache the
          // maintenance response — once the operator flips the flag
          // back off, the next request must hit the worker again.
          "Cache-Control": "no-store",
          Pragma: "no-cache",
        },
      });
    }
    try {
      if (_maintenanceCacheExpiry < Date.now()) {
        const kv = getAppCacheKV();
        if (kv) {
          const kvMaintenance = await kv.get("maintenance_mode");
          _maintenanceCacheValue =
            kvMaintenance?.toLowerCase() === "1" || kvMaintenance?.toLowerCase() === "true";
        }
        _maintenanceCacheExpiry = Date.now() + 30_000;
      }
      if (_maintenanceCacheValue) {
        return new NextResponse(JSON.stringify({ error: "Service temporarily unavailable." }), {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            // G-35: same no-store guarantee as the env-var branch above.
            "Cache-Control": "no-store",
            Pragma: "no-cache",
          },
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
    // P1-10: Resolve site identity for preflight requests from both static
    // config AND cached DB entries. Previously only static-config sites were
    // checked, so custom-domain preflights would always 403 until the site
    // was resolved in the main flow (which doesn't run for OPTIONS).
    const preflightStaticSite = getSiteByDomain(hostname);
    let preflightVerifiedSite: VerifiedSiteRef | null = preflightStaticSite
      ? {
          slug: preflightStaticSite.id,
          domain: preflightStaticSite.domain,
          aliases: preflightStaticSite.aliases,
        }
      : null;

    // P1-10: For custom domains not in static config, check the KV cache
    // so verified custom domains can preflight without a fresh DB lookup.
    if (!preflightVerifiedSite) {
      try {
        const kv = getAppCacheKV();
        if (kv) {
          const cachedRow = (await kv.get(`site-domain:${hostname}`, "json")) as {
            slug?: string;
            is_active?: boolean;
          } | null;
          if (cachedRow?.slug && cachedRow?.is_active) {
            preflightVerifiedSite = { slug: cachedRow.slug, domain: hostname };
          }
        }
      } catch {
        // KV errors during preflight are non-fatal — fall through to static-only
      }
    }

    const allowedOrigins = getAllowedOrigins(preflightVerifiedSite);
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
  const site = getSiteByDomain(hostname);
  let siteId = site?.id;
  // G-33: track the verified site (slug + domain + aliases) alongside
  // siteId so downstream CORS / CSRF checks can pass a typed reference
  // into `getAllowedOrigins` — never a raw hostname.
  let verifiedSite: VerifiedSiteRef | null = site
    ? { slug: site.id, domain: site.domain, aliases: site.aliases }
    : null;

  // .localhost dev pattern inspired by https://github.com/vercel/platforms (MIT).
  // Skip the DB lookup for *.localhost in non-production — dev only, no DB calls.
  //
  // ALLOW_LOCALHOST_FALLBACK_IN_PROD=1 extends this bypass to production-mode
  // local runs (e.g. Lighthouse CI, which executes `next start` with
  // NODE_ENV=production against http://localhost:9222). Without this opt-in,
  // the unknown-host rate-limit below would 429 every request because the
  // rate-limit store (Supabase) is unreachable in CI and the fail policy is
  // "closed". Must be exact "1" — keep it inert on any other value.
  const hostWithoutPort = hostname.includes(":") ? hostname.split(":")[0] : hostname;
  const allowLocalhostInProd = process.env.ALLOW_LOCALHOST_FALLBACK_IN_PROD === "1";
  const isLocalhostDev =
    (process.env.NODE_ENV !== "production" || allowLocalhostInProd) &&
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
        return new NextResponse("Too Many Requests", {
          status: 429,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            Pragma: "no-cache",
            "Retry-After": String(Math.ceil(rlResult.retryAfterMs / 1000) || 60),
          },
        });
      }
    } catch (rlErr) {
      // P0-2: Rate limit check itself failed — fail CLOSED. Under a KV/DO
      // outage or hostile Host-header flood, do NOT fall through to DB lookup.
      captureException(rlErr, {
        context: "middleware.hostname-resolve-rate-limit-failed",
        extra: { hostname },
      });
      return new NextResponse(JSON.stringify({ error: "Rate limit unavailable" }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store, max-age=0",
          Pragma: "no-cache",
          "Retry-After": "30",
        },
      });
    }

    // G-34: worker-wide LRU cap on the number of *distinct* unknown
    // hostnames we'll let touch KV in any rolling 1s window. The per-IP
    // limit above stops any single source; this stops the cumulative
    // effect of a distributed flood from forcing one KV read per random
    // Host: header. When the cap is exceeded we behave as if we'd
    // negative-cached the host: the request gets the same 404 the
    // legitimate "unknown niche" path returns, without paying the KV or
    // DB cost.
    const guardResult = recordUnknownHostKvAccess(hostname);
    if (!guardResult.allowed) {
      return nicheNotFoundResponse(request);
    }

    try {
      const cacheKey = `site-domain:${hostname}`;
      const negativeCacheKey = `site-domain-miss:${hostname}`;
      let cachedRow: { id?: string; slug?: string; is_active?: boolean } | null = null;
      let isNegativeCached = false;
      let priorMissCount = 0;
      try {
        const kv = getAppCacheKV();
        if (kv) {
          // Check negative cache first — short-circuits the DB lookup
          // entirely for hostnames we've already seen as unknown.
          // G-34: the value is now `{m: number}` JSON so we can ramp
          // the TTL on each subsequent miss.  Also accept the legacy
          // "1" sentinel for entries written by previous deploys.
          const negative = await kv.get(negativeCacheKey);
          if (negative === "1") {
            isNegativeCached = true;
            priorMissCount = 1;
          } else if (negative) {
            try {
              const parsed = JSON.parse(negative) as { m?: number };
              if (parsed && typeof parsed.m === "number" && parsed.m > 0) {
                isNegativeCached = true;
                priorMissCount = parsed.m;
              }
            } catch {
              // Corrupt entry — treat as a fresh miss so the next
              // write replaces it with a well-formed value.
            }
          } else {
            cachedRow = await kv.get(cacheKey, "json");
          }
        }
      } catch (e) {}

      if (isNegativeCached) {
        // G-34: each repeat hit on the negative cache bumps the miss
        // counter and extends the TTL via the ramp helper. Without
        // this the entry would expire after the floor TTL even for a
        // host that has been hammered for hours, and the ramp
        // (300 → 600 → 1200 → 2400 → 3600s) would never activate.
        const nextMissCount = priorMissCount + 1;
        const ttlSeconds = getNegativeCacheTtlSeconds(nextMissCount);
        try {
          const kv = getAppCacheKV();
          if (kv)
            await kv.put(negativeCacheKey, JSON.stringify({ m: nextMissCount }), {
              expirationTtl: ttlSeconds,
            });
        } catch (e) {}
        return nicheNotFoundResponse(request);
      }

      const row = cachedRow || (await getSiteRowByDomain(hostname));
      if (row && !cachedRow) {
        try {
          const kv = getAppCacheKV();
          if (kv) await kv.put(cacheKey, JSON.stringify(row), { expirationTtl: 60 });
        } catch (e) {}
      }
      if (row && row.is_active && row.slug) {
        siteId = row.slug;
        // G-33: the DB lookup matched on `domain = hostname`, so the
        // request hostname IS a verified registered domain for this
        // site. Build the verified ref from it so downstream callers
        // can extend the allow-list safely.
        verifiedSite = { slug: row.slug, domain: hostname };
      } else if (row && !row.is_active) {
        return nicheNotFoundResponse(request);
      } else if (!row) {
        // G-34: first miss writes the floor TTL; subsequent misses
        // are handled by the negative-cache-hit branch above, which
        // ramps the TTL toward the 1-hour ceiling.
        const nextMissCount = priorMissCount + 1;
        const ttlSeconds = getNegativeCacheTtlSeconds(nextMissCount);
        try {
          const kv = getAppCacheKV();
          if (kv)
            await kv.put(negativeCacheKey, JSON.stringify({ m: nextMissCount }), {
              expirationTtl: ttlSeconds,
            });
        } catch (e) {}
      }
    } catch (err) {
      // F-025: Log structured error with trace id and emit Sentry instead of silent failure
      console.error(`[middleware] DB lookup failed for domain: ${hostname}`, { traceId, err });
      captureException(err, {
        context: "[middleware] getSiteRowByDomain",
        extra: { hostname, traceId },
      });

      // P1-1: Serve a branded temporary unavailable response rather than a
      // confusing 404. All middleware-generated 5xx responses MUST set
      // Cache-Control: no-store so CDNs/browsers never cache error pages.
      return new NextResponse(
        JSON.stringify({
          error: "Service Temporarily Unavailable",
          message: "The platform is currently experiencing database connectivity issues.",
          traceId,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, max-age=0",
            Pragma: "no-cache",
          },
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
    // G-33: pass the verified site reference, not the raw hostname.
    const allowedOrigins = getAllowedOrigins(verifiedSite);

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
      // G-33: pass the verified site reference, not the raw hostname.
      const allowedOrigins = getAllowedOrigins(verifiedSite);
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
    // F-024: Set the Report-To header for CSP Level 3 modern browser reporting.
    response.headers.set("Report-To", buildReportToHeader());
  }

  // Removed CSRF token rotation on state-changing requests
  // to support concurrent POST requests and prevent token exposure in response headers.

  return response;
}

// F-FE-02: Wrap middleware in a try/catch to prevent a single unhandled
// exception (e.g. from URL parsing or KV) from taking down the entire site.
export async function middleware(request: NextRequest) {
  try {
    return await innerMiddleware(request);
  } catch (err) {
    captureException(err, { context: "middleware.unhandled_exception" });

    // Fallback: If it's an API route, return 500 JSON.
    // Otherwise, return a soft-failed request so the Next.js app can still render
    // a basic page (e.g. not-found or an un-branded homepage).
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Internal Server Error" },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        },
      );
    }

    // For non-API routes, we can't easily resolve siteId if DB/KV failed.
    // Passing through without headers allows the app to render its generic fallback.
    const response = NextResponse.next();
    response.headers.set("x-middleware-error", "1");
    return response;
  }
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
