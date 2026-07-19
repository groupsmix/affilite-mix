import { NextRequest, NextResponse } from "next/server";
import { TRACE_ID_HEADER } from "@/lib/trace-id";
// H-4: Composable middleware modules.
import { withMaintenance } from "@/lib/middleware/maintenance";
// F-007: hostname utils + domain→site resolution extracted for testability.
import {
  canonicalizeHostname,
  isValidHostname,
  nicheNotFoundResponse,
} from "@/lib/middleware/hostname";
import { resolveSite } from "@/lib/middleware/site-resolution";
import { applyRedirects } from "@/lib/middleware/redirects";
// CA-302: canonical "X-vs-Y" comparison slug ordering.
import { canonicalComparisonPath } from "@/lib/vs-slug";
// F-007: CORS preflight + CSRF concerns extracted to independently-tested
// modules and composed here, replacing the previous inline duplicates.
import { withCorsPreflight } from "@/lib/middleware/cors";
import { withCsrf } from "@/lib/middleware/csrf";
import type { MiddlewareContext } from "@/lib/middleware/compose";

import {
  buildCspHeader,
  generateCspNonce,
  NONCE_HEADER,
  buildReportToHeader,
  buildReportingEndpointsHeader,
} from "@/lib/csp";
import { captureException } from "@/lib/sentry";
import { getAllowedOrigins } from "@/lib/security/allowed-origins";
import { checkRateLimit } from "@/lib/rate-limit";
import { signSiteIdFallback } from "@/lib/site-id-signer";
import { checkBodySize, applySecurityHeaders } from "@/lib/middleware-helpers";
import { parseOrCreateTraceContext, applyTraceHeaders, exportTraceSpan } from "@/lib/tracing";
import { emitMetric } from "@/lib/metrics";
// F-017: env-tunable self-reference recursion ceiling (default 2, was 3).
import { MAX_RECURSION_DEPTH, RECURSION_DEPTH_HEADER } from "@/lib/worker-recursion";
import { PATHNAME_HEADER } from "@/lib/request-path";
import { setApiVersionHeaders } from "@/lib/api-version";

const CSP_HEADER = "Content-Security-Policy";

function finalizeApiVersionResponse(request: NextRequest, response: NextResponse): NextResponse {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    setApiVersionHeaders(response.headers);
  }
  return response;
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
// F-09 / F-017: the self-reference recursion ceiling and its header now live
// in lib/worker-recursion.ts (env-tunable, default 2) and are imported above.

async function innerMiddleware(request: NextRequest, signal?: AbortSignal) {
  // F-09: Guard against self-referential subrequest amplification.
  // WORKER_SELF_REFERENCE (wrangler.jsonc) can cause the Worker to re-enter
  // itself; cap the depth to prevent runaway cost/CPU spikes.
  const depthStr = request.headers.get(RECURSION_DEPTH_HEADER);
  const depth = depthStr ? parseInt(depthStr, 10) : 0;
  if (depth >= MAX_RECURSION_DEPTH) {
    return NextResponse.json(
      { error: "Too many internal redirects", code: "RECURSION_LIMIT" },
      { status: 508, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { pathname } = request.nextUrl;
  let { hostname } = request.nextUrl;

  // A98-52: Canonicalize hostname before any cache key usage.
  // This prevents cache fragmentation from DNS-equivalent forms.
  hostname = canonicalizeHostname(hostname);

  // SECURITY-FIX: Sanitize hostname to prevent prototype pollution and path traversal
  // in KV key construction (T1-001, T1-003 / CWE-1321, CWE-22)
  if (!isValidHostname(hostname)) {
    return nicheNotFoundResponse(request);
  }

  // ── Shared middleware context (H-4 / F-007) ────────────
  // One mutable context threaded through the composable concerns
  // (maintenance, CORS preflight, CSRF). Site resolution fills in
  // siteId/verifiedSite/traceId partway through the pipeline.
  const gpcEnabled = request.headers.get("sec-gpc") === "1";
  const ctx: MiddlewareContext = {
    hostname,
    pathname,
    siteId: null,
    verifiedSite: null,
    traceId: "",
    gpcEnabled,
    depth,
    signal,
  };

  // ── Maintenance mode (A-023 / F-PERF-02) ──────────────
  // H-4: Delegated to composable module for independent testability.
  const maintenanceResponse = await withMaintenance(request, ctx);
  if (maintenanceResponse) return maintenanceResponse;

  // ── Request body size guard (AUDIT-FIX A1-002) ─────────
  const bodySizeError = checkBodySize(request);
  if (bodySizeError) return bodySizeError;

  // ── A157-01: Global per-IP rate limit for public pages ────
  // A generous limit (200 req/min) that only catches aggressive scrapers
  // and DoS attempts. Normal users won't hit this.
  if (!pathname.startsWith("/api/")) {
    const publicIp = request.headers.get("cf-connecting-ip") ?? "unknown";
    try {
      const publicRl = await checkRateLimit(`public-page:${publicIp}`, {
        maxRequests: 200,
        windowMs: 60 * 1000,
        failPolicy: "open" as const,
      });
      if (!publicRl.allowed) {
        return new NextResponse("Too Many Requests", {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(publicRl.retryAfterMs / 1000)),
            "Cache-Control": "no-store",
          },
        });
      }
    } catch {
      // fail-open: rate limit infra unavailable — allow request
    }
  }

  // ── GPC (Global Privacy Control) signal (A63) ───────────
  // Computed into `ctx.gpcEnabled` above. The finalizer attaches a
  // response header so the cookie-consent CMP can default non-essential
  // categories to rejected without showing the banner. Required by
  // California AG enforcement (Sephora settlement, 2023).

  // ── Trailing-slash normalization (SA9) ─────────────────
  // DEFERRED: moved after site resolution so the redirect uses the
  // canonical verified hostname rather than the attacker-supplied Host.
  // See the slash-normalization block below (after `if (!siteId)`).

  // ── CORS preflight (OPTIONS) ───────────────────────────
  // F-007: handled by the extracted, independently-tested module.
  const corsPreflightResponse = await withCorsPreflight(request, ctx);
  if (corsPreflightResponse) return corsPreflightResponse;

  // ── Resolve site (domain → siteId) ─────────────────────
  // F-007: extracted to lib/middleware/site-resolution for independent
  // testability. Returns either a short-circuit response (404/429/503) or the
  // resolved site context to continue with.
  const resolution = await resolveSite(request, hostname, signal);
  if (resolution.type === "response") return resolution.response;
  const { siteId, verifiedSite, traceId, redirects } = resolution;
  // Thread resolved identity into the shared context for downstream
  // composable concerns (CSRF, and any future withX modules).
  ctx.siteId = siteId;
  ctx.verifiedSite = verifiedSite;
  ctx.traceId = traceId;

  // ── Per-site URL redirects (301/302 hygiene) — BEFORE trailing-slash ──
  const redirectResponse = applyRedirects(request, redirects);
  if (redirectResponse) return redirectResponse;

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
    return NextResponse.redirect(url, 308); // nosemgrep
  }

  // ── Canonical comparison slug (CA-302) ─────────────────
  // "X-vs-Y" comparisons can be written either way round; the alphabetically
  // ordered form is canonical and the reverse 301s to it, so the two
  // orderings never compete as duplicate content. Pure string work (no DB),
  // and the hostname is forced to the verified domain — same anti-reflection
  // discipline as the trailing-slash redirect above.
  if (!pathname.startsWith("/api/")) {
    const canonicalPath = canonicalComparisonPath(pathname);
    if (canonicalPath) {
      const url = request.nextUrl.clone();
      if (verifiedSite?.domain) {
        url.hostname = verifiedSite.domain;
      }
      url.pathname = canonicalPath;
      return NextResponse.redirect(url, 301); // nosemgrep
    }
  }

  // ── CSRF protection for state-changing API routes ─────
  // F-007: handled by the extracted, independently-tested module.
  const csrfResponse = withCsrf(request, ctx);
  if (csrfResponse) return csrfResponse;

  // ── Inject x-site-id and trace-id headers into request ──
  // siteId is guaranteed non-null at this point: the `if (!siteId)` guard
  // above returns `nicheNotFoundResponse(request)` for the falsy case.
  const requestHeaders = new Headers(request.headers);
  // F-09: Propagate incremented recursion depth so self-referential
  // subrequests via WORKER_SELF_REFERENCE are capped at MAX_RECURSION_DEPTH.
  requestHeaders.set(RECURSION_DEPTH_HEADER, String(depth + 1));
  requestHeaders.set("x-site-id", siteId);
  // Propagate the request pathname so Server Components (e.g. the root layout)
  // can make path-aware decisions Next.js does not otherwise expose to layouts
  // — used to suppress the public cookie-consent banner on /q7m-k4j9/* admin routes.
  requestHeaders.set(PATHNAME_HEADER, pathname);
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
  applySecurityHeaders(response, {
    pathname,
    gpcEnabled,
    cspHeaderValue,
    traceId,
  });

  // ── W3C Trace Context (R-002) ──────────────────────────
  const traceCtx = parseOrCreateTraceContext(request);
  applyTraceHeaders(response.headers, traceCtx);

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
    response.headers.set("Reporting-Endpoints", buildReportingEndpointsHeader());
  }

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
/**
 * Legacy admin path retired in 2026-06-09 in favour of an edge-gated
 * non-function-hinting segment. The path is kept as 410 Gone (RFC 9110 §15.5.10):
 *
 *   - 410 — not 404 — signals that the resource is intentionally and
 *     permanently gone. Search engines deindex 410 faster than 404.
 *   - The body is intentionally minimal so it provides no oracle for
 *     scanners trying to fingerprint the application.
 *   - Cache-Control: no-store so caches don't serve stale 410s if the
 *     decision is ever reversed.
 *
 * This runs *before* the timeout/CSP composition machinery because the
 * decision is static and we want it to be cheap. Cloudflare Access may
 * additionally challenge this path during the transition window; once
 * the legacy domain is removed from the Access app, the response is
 * served directly by the Worker.
 */
const RETIRED_ADMIN_PATH_PREFIX = "/admin";

function isRetiredAdminPath(pathname: string): boolean {
  return (
    pathname === RETIRED_ADMIN_PATH_PREFIX || pathname.startsWith(`${RETIRED_ADMIN_PATH_PREFIX}/`)
  );
}

function retiredAdminResponse(): NextResponse {
  return new NextResponse("Gone", {
    status: 410,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function middleware(request: NextRequest) {
  // Retired admin path — return 410 Gone immediately, before any
  // timeout / DB / KV work. See `isRetiredAdminPath` above.
  if (isRetiredAdminPath(request.nextUrl.pathname)) {
    return retiredAdminResponse();
  }

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

    const start = performance.now();
    const traceCtx = parseOrCreateTraceContext(request);
    const result = await Promise.race([
      innerMiddleware(request, abortController.signal),
      timeoutPromise,
    ]);
    const durationMs = Math.round(performance.now() - start);
    emitMetric("middleware_latency_ms", durationMs, {
      path: request.nextUrl.pathname,
      status: String(result.status),
    });
    exportTraceSpan(traceCtx, "middleware", durationMs, {
      path: request.nextUrl.pathname,
      status: result.status,
    });
    return finalizeApiVersionResponse(request, result);
  } catch (err) {
    // A98-49: Swallow AbortError — it means the timeout fired and we already
    // returned 503. Other errors are genuine and should be reported.
    if (err instanceof Error && err.name === "AbortError") {
      return finalizeApiVersionResponse(
        request,
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
    }

    captureException(err, { context: "middleware.unhandled_exception" });

    // Fallback: If it's an API route, return 500 JSON.
    // Otherwise, return a soft-failed request so the Next.js app can still render
    // a basic page (e.g. not-found or an un-branded homepage).
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return finalizeApiVersionResponse(
        request,
        NextResponse.json(
          { error: "Internal Server Error", code: "INTERNAL_ERROR" },
          {
            status: 500,
            headers: {
              "Cache-Control": "no-store, max-age=0",
            },
          },
        ),
      );
    }

    // F10: For non-API routes, attach a minimal safe CSP + security headers
    // even when DB/KV is down. Without this, error pages ship without CSP
    // exactly when they're most likely to echo influenced data.
    const response = NextResponse.next();
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'none'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; upgrade-insecure-requests",
    );
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    // AUDIT-11: this F10 error-path fallback must stay byte-for-byte
    // identical to the per-request policy in `applySecurityHeaders`
    // (lib/middleware-helpers.ts) and the static copy in next.config.ts.
    // Previously this copy was missing `interest-cohort=()` (G-51), so the
    // degraded error response silently dropped the FLoC/Topics opt-out.
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), interest-cohort=()",
    );
    response.headers.set("Cache-Control", "no-store, max-age=0");
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
     * - /api/internal/* — excluded intentionally: internal endpoints
     *   use their own internal-token auth + per-route rate limiting
     *   (lib/internal-auth.ts). Widening the matcher would break
     *   internal auth; removing internal-token checks would create
     *   an unprotected surface.
     */
    "/((?!_next/static|_next/image|favicon.ico|api/internal/).*)",
  ],
};
