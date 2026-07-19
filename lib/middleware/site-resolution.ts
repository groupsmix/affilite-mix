/**
 * F-007: Domain → site resolution, extracted verbatim from middleware.ts so
 * the hot-path resolution logic (static-config lookup, localhost-dev bypass,
 * per-IP hostname-resolution flood limit, distributed unknown-host LRU guard,
 * KV negative cache with TTL ramp, and the Supabase fallback lookup) can be
 * unit tested in isolation.
 *
 * Behaviour is unchanged from the previous inline implementation. The function
 * returns a discriminated union: either a short-circuit `response` (404 for an
 * unknown/inactive niche, 429 when the per-IP resolve limit trips, 503 when the
 * rate-limit infra or the DB lookup fails) or the `resolved` site context
 * (siteId + verified site ref + trace id) for the caller to continue with.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain } from "@/config/sites";
import { getMiddlewareSiteRowByDomain } from "@/lib/middleware-site-lookup";
import { generateTraceId, TRACE_ID_HEADER } from "@/lib/trace-id";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { type VerifiedSiteRef } from "@/lib/security/allowed-origins";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getNegativeCacheTtlSeconds,
  recordUnknownHostKvAccess,
} from "@/lib/security/unknown-host-guard";
import { getAppCacheKV } from "@/lib/runtime-env";
import { nicheNotFoundResponse } from "@/lib/middleware/hostname";

/** A98-49: Throw if the request has been aborted, so downstream work stops. */
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error("Middleware aborted due to timeout");
    err.name = "AbortError";
    throw err;
  }
}

/**
 * NEW-01: Hoisted to module scope — the env var does not change within an
 * isolate's lifetime, so there is no reason to re-parse it on every request.
 */
const PREVIEW_HOST_ALLOWLIST: Set<string> | null = (() => {
  const raw = process.env.PREVIEW_HOST_ALLOWLIST ?? "";
  return raw ? new Set(raw.split(",").map((h) => h.trim().toLowerCase())) : null;
})();

/**
 * Result of resolving a request hostname to a tenant site.
 * - `response`: a terminal response the middleware should return immediately.
 * - `resolved`: the verified site context the middleware should continue with.
 */
export interface SiteRedirect {
  source_path: string;
  destination_path: string;
  permanent?: boolean;
}

export type SiteResolution =
  | { type: "response"; response: NextResponse }
  | {
      type: "resolved";
      siteId: string;
      verifiedSite: VerifiedSiteRef | null;
      traceId: string;
      redirects: SiteRedirect[];
    };

function parseSiteRedirects(value: unknown): SiteRedirect[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (r): r is SiteRedirect =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as SiteRedirect).source_path === "string" &&
        typeof (r as SiteRedirect).destination_path === "string" &&
        (r as SiteRedirect).source_path.trim().length > 0,
    )
    .map((r) => ({
      source_path: r.source_path,
      destination_path: r.destination_path,
      permanent: r.permanent === true,
    }));
}

function originMatchesVerifiedSite(
  request: NextRequest,
  verifiedSite: VerifiedSiteRef | null,
): boolean {
  const origin = request.headers.get("origin");
  if (!origin || !verifiedSite) return true;

  try {
    const originHost = new URL(origin).hostname.toLowerCase();
    const allowedHosts = new Set(
      [verifiedSite.domain, ...(verifiedSite.aliases ?? [])].map((host) => host.toLowerCase()),
    );
    return allowedHosts.has(originHost);
  } catch {
    return false;
  }
}

export async function resolveSite(
  request: NextRequest,
  hostname: string,
  signal?: AbortSignal,
): Promise<SiteResolution> {
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
  let redirects: SiteRedirect[] = [];

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
  const isLocalhostDev =
    (process.env.NODE_ENV !== "production" || allowLocalhostInProd) &&
    (hostWithoutPort === "localhost" || hostWithoutPort!.endsWith(".localhost")) &&
    (!PREVIEW_HOST_ALLOWLIST || PREVIEW_HOST_ALLOWLIST.has(hostWithoutPort!.toLowerCase()));

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
        return {
          type: "response",
          response: new NextResponse("Too Many Requests", {
            status: 429,
            headers: {
              "Cache-Control": "no-store, max-age=0",
              Pragma: "no-cache",
              "Retry-After": String(Math.ceil(rlResult.retryAfterMs / 1000) || 60),
            },
          }),
        };
      }
    } catch (rlErr) {
      // P0-2: Rate limit check itself failed — fail CLOSED. Under a KV/DO
      // outage or hostile Host-header flood, do NOT fall through to DB lookup.
      captureException(rlErr, {
        context: "middleware.hostname-resolve-rate-limit-failed",
        extra: { hostname },
      });
      return {
        type: "response",
        response: new NextResponse(JSON.stringify({ error: "Rate limit unavailable" }), {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store, max-age=0",
            Pragma: "no-cache",
            "Retry-After": "30",
          },
        }),
      };
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
      return { type: "response", response: nicheNotFoundResponse(request) };
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
        return { type: "response", response: nicheNotFoundResponse(request) };
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
        redirects = parseSiteRedirects(row.url_redirects);
      } else if (row && !row.is_active) {
        return { type: "response", response: nicheNotFoundResponse(request) };
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
      return {
        type: "response",
        response: new NextResponse(
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
        ),
      };
    }
  }

  if (!siteId) {
    return { type: "response", response: nicheNotFoundResponse(request) };
  }

  if (!originMatchesVerifiedSite(request, verifiedSite)) {
    logger.warn("[middleware] request origin does not match resolved site domain", {
      origin: request.headers.get("origin"),
      hostname,
      siteId,
      verified_domain: verifiedSite?.domain,
    });
    return {
      type: "response",
      response: new NextResponse("Forbidden", {
        status: 403,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          Pragma: "no-cache",
        },
      }),
    };
  }

  return { type: "resolved", siteId, verifiedSite, traceId, redirects };
}
