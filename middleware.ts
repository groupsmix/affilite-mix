import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain } from "@/config/sites";
import { validateCsrfToken, CSRF_COOKIE, CSRF_HEADER } from "@/lib/csrf";
import { getMiddlewareSiteRowByDomain } from "@/lib/middleware-site-lookup";
import { generateTraceId, TRACE_ID_HEADER } from "@/lib/trace-id";
import { buildCspHeader, generateCspNonce, NONCE_HEADER, buildReportToHeader } from "@/lib/csp";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { CRON_PATH_PREFIX } from "@/lib/cron-registry";
import { csrfExemptPaths } from "@/lib/security/csrf-exempt-registry";
import { getAllowedOrigins, type VerifiedSiteRef } from "@/lib/security/allowed-origins";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getNegativeCacheTtlSeconds,
  recordUnknownHostKvAccess,
} from "@/lib/security/unknown-host-guard";
import { getAppCacheKV } from "@/lib/runtime-env";
import { signSiteIdFallback } from "@/lib/supabase-server";
import { checkBodySize, applySecurityHeaders } from "@/lib/middleware-helpers";

const CSP_HEADER = "Content-Security-Policy";

/** A98-49: Throw if the request has been aborted, so downstream work stops. */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("Middleware aborted due to timeout");
    err.name = "AbortError";
    throw err;
  }
}

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
 * A98-52: Canonicalize a hostname for use as a cache key.
 * - Lowercases (DNS is case-insensitive)
 * - Removes trailing dot (FQDN form → canonical)
 * - Strips port number
 *
 * This prevents cache fragmentation from equivalent hostnames
 * like "Example.COM", "example.com.", and "example.com:443".
 */
function canonicalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

/**
 * Middleware: resolves domain → site_id and injects x-site-id header.
 * Supports wildcard subdomain routing — any *.wristnerd.xyz subdomain
 * is automatically resolved via DB lookup.
 * Also handles CSRF protection for state-changing API routes.
 *
 * A98-49: Accepts an AbortSignal so the timeout wrapper can cancel
 * downstream async work (KV reads, DB lookups) when the deadline fires.
 */
async function innerMiddleware(request: NextRequest, signal?: AbortSignal) {
  const { pathname } = request.nextUrl;
  let { hostname } = request.nextUrl;

  // A98-52: Canonicalize hostname before any cache key usage.
  // This prevents cache fragmentation from DNS-equivalent forms.
  hostname = canonicalizeHostname(hostname);

  // SECURITY-FIX: Sanitize hostname to prevent prototype pollution and path traversal
  // in KV key construction (T1-001, T1-003 / CWE-1321, CWE-22)
  if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/i.test(hostname) || hostname.length > 253) {
    return nicheNotFoundResponse(request);
  }

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
      throwIfAborted(signal);
      if (_maintenanceCacheExpiry < Date.now()) {
        const kv = getAppCacheKV();
        if (kv) {
          const kvMaintenance = await kv.get("maintenance_mode");
          throwIfAborted(signal);
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

  // ── Request body size guard (AUDIT-FIX A1-002) ─────────
  const bodySizeError = checkBodySize(request);
  if (bodySizeError) return bodySizeError;

  // ── GPC (Global Privacy Control) signal (A63) ───────────
  // If the browser sends Sec-GPC: 1, attach a response header so
  // the cookie-consent CMP can default non-essential categories to
  // rejected without showing the banner. Required by California AG
  // enforcement (Sephora settlement, 2023).
  const gpcEnabled = request.headers.get("sec-gpc") === "1";

  // ── Trailing-slash normalization (SA9) ─────────────────
  // DEFERRED: moved after site resolution so the redirect uses the
  // canonical verified hostname rather than the attacker-supplied Host.
  // See the slash-normalization block below (after `if (!siteId)`).

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

  // A98-49: Check abort before expensive DB/KV operations
  throwIfAborted(signal);

  // .localhost dev pattern inspired by https://github.com/vercel/platforms (MIT).
  // Skip the DB lookup for *.localhost in non-production — dev only, no DB calls.
  //
  // A7-008: ALLOW_LOCALHOST_FALLBACK_IN_PROD=1 extends this bypass to
  // production-mode local runs (Lighthouse CI, docker smoke tests). When
  // PREVIEW_HOST_ALLOWLIST is set (comma-separated hostnames), only those
  // hosts are accepted, adding a second gate beyond the boolean flag.
  const hostWithoutPort = hostname.includes(":") ? hostname.split(":")[0] : hostname;
  const allowLocalhostInProd = process.env.ALLOW_LOCALHOST_FALLBACK_IN_PROD === "1";
  const previewAllowlistRaw = process.env.PREVIEW_HOST_ALLOWLIST ?? "";
  const previewAllowlist = previewAllowlistRaw
    ? new Set(previewAllowlistRaw.split(",").map((h) => h.trim().toLowerCase()))
    : null;
  const isLocalhostDev =
    (process.env.NODE_ENV !== "production" || allowLocalhostInProd) &&
    (hostWithoutPort === "localhost" || hostWithoutPort.endsWith(".localhost")) &&
    (!previewAllowlist || previewAllowlist.has(hostWithoutPort.toLowerCase()));

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
      throwIfAborted(signal);
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
        throwIfAborted(signal);
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
            cachedRow = (await kv.get(cacheKey, "json")) as typeof cachedRow;
          }
        }
      } catch (e) {
        logger.warn("[middleware] KV cache read failed", {
          hostname,
          error: e instanceof Error ? e.message : String(e),
        });
      }

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
        } catch (e) {
          logger.warn("[middleware] KV negative-cache write failed", {
            hostname,
            error: e instanceof Error ? e.message : String(e),
          });
        }
        return nicheNotFoundResponse(request);
      }

      throwIfAborted(signal);
      const row = cachedRow || (await getMiddlewareSiteRowByDomain(hostname));
      throwIfAborted(signal);
      if (row && !cachedRow) {
        try {
          const kv = getAppCacheKV();
          if (kv) await kv.put(cacheKey, JSON.stringify(row), { expirationTtl: 60 });
        } catch (e) {
          logger.warn("[middleware] KV cache write failed", {
            hostname,
            error: e instanceof Error ? e.message : String(e),
          });
        }
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
        } catch (e) {
          logger.warn("[middleware] KV negative-cache write failed", {
            hostname,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } catch (err) {
      // F-025: Log structured error with trace id and emit Sentry instead of silent failure
      // T-03: Use structured logger to prevent log injection via hostname
      logger.error("[middleware] DB lookup failed for domain", { hostname, traceId, err });
      captureException(err, {
        context: "[middleware] getMiddlewareSiteRowByDomain",
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

  // ── Trailing-slash normalization (SA9) — AFTER site resolution ──
  // AUDIT-FIX A1-001/A2-001: Force canonical hostname so an attacker
  // cannot reflect an arbitrary Host header into the Location header.
  // Only runs once we have a verifiedSite (or static config site).
  if (pathname !== "/" && pathname.endsWith("/") && !pathname.startsWith("/api/")) {
    const url = request.nextUrl.clone();
    // Force the canonical domain from the verified site resolution above
    if (verifiedSite?.domain) {
      url.hostname = verifiedSite.domain;
    }
    url.pathname = pathname.replace(/\/+$/, "");
    return NextResponse.redirect(url, 308);
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
  // siteId is guaranteed non-null at this point: the `if (!siteId)` guard
  // above returns `nicheNotFoundResponse(request)` for the falsy case.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-site-id", siteId);
  // A7-005: Sign the site-id header so downstream getTenantClient() can
  // verify it came from middleware, not from a spoofed client request.
  const siteIdSig = await signSiteIdFallback(siteId);
  if (siteIdSig) {
    requestHeaders.set("x-site-id-sig", siteIdSig);
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

  // ── Security + cache headers (extracted to middleware-helpers) ──
  applySecurityHeaders(response, { pathname, gpcEnabled, cspHeaderValue, traceId });

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
    response.headers.set("Report-To", buildReportToHeader());
  }

  // Removed CSRF token rotation on state-changing requests
  // to support concurrent POST requests and prevent token exposure in response headers.

  return response;
}

/**
 * A100-06: Middleware-level request timeout. If the entire middleware
 * execution (KV reads, DB lookups, rate-limit checks, CORS validation)
 * takes longer than this, return 503 immediately rather than consuming
 * Worker CPU time until the platform hard-kills at 30s.
 */
const MIDDLEWARE_TIMEOUT_MS = 5000;

// F-FE-02: Wrap middleware in a try/catch to prevent a single unhandled
// exception (e.g. from URL parsing or KV) from taking down the entire site.
export async function middleware(request: NextRequest) {
  // A98-49: AbortController lets us cancel downstream KV/DB work when the
  // timeout fires. Without this, the inner middleware continues running
  // after Promise.race resolves, multiplying load during outages.
  const abortController = new AbortController();

  try {
    // A100-06: Race the middleware against a timeout to prevent a single
    // hanging external call from consuming the full Worker CPU budget.
    const timeoutPromise = new Promise<NextResponse>((resolve) => {
      const timer = setTimeout(() => {
        abortController.abort();
        resolve(
          NextResponse.json(
            { error: "Gateway Timeout", code: "MIDDLEWARE_TIMEOUT" },
            {
              status: 503,
              headers: {
                "Retry-After": "5",
                "Cache-Control": "no-store",
              },
            },
          ),
        );
      }, MIDDLEWARE_TIMEOUT_MS);

      // Clean up timer if the inner middleware wins the race
      abortController.signal.addEventListener("abort", () => clearTimeout(timer));
    });

    return await Promise.race([innerMiddleware(request, abortController.signal), timeoutPromise]);
  } catch (err) {
    // A98-49: Swallow AbortError — it means the timeout fired and we already
    // returned 503. Other errors are genuine and should be reported.
    if (err instanceof Error && err.name === "AbortError") {
      return NextResponse.json(
        { error: "Gateway Timeout", code: "MIDDLEWARE_TIMEOUT" },
        {
          status: 503,
          headers: {
            "Retry-After": "5",
            "Cache-Control": "no-store",
          },
        },
      );
    }

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
