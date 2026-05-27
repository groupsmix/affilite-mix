/**
 * Site resolution logic extracted from middleware.ts (R-019 / E3#22).
 *
 * Resolves a request hostname to a site identity through:
 *   1. Static config lookup (fast, no DB/KV)
 *   2. KV negative cache check (avoids DB for known-unknown hosts)
 *   3. KV positive cache check
 *   4. DB lookup (getMiddlewareSiteRowByDomain)
 *
 * Returns the resolved siteId and a verified site reference, or an error
 * response if the host is blocked/rate-limited/unavailable.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSiteByDomain } from "@/config/sites";
import { getMiddlewareSiteRowByDomain } from "@/lib/middleware-site-lookup";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  getNegativeCacheTtlSeconds,
  recordUnknownHostKvAccess,
} from "@/lib/security/unknown-host-guard";
import { getAppCacheKV } from "@/lib/runtime-env";
import type { VerifiedSiteRef } from "@/lib/security/allowed-origins";

export interface SiteResolutionResult {
  siteId: string | undefined;
  verifiedSite: VerifiedSiteRef | null;
}

export interface SiteResolutionContext {
  hostname: string;
  traceId: string;
  signal?: AbortSignal;
  throwIfAborted: (signal?: AbortSignal) => void;
  nicheNotFoundResponse: (request: NextRequest) => NextResponse;
}

/**
 * Try static config first. Returns null if hostname is not in static config.
 */
export function resolveStaticSite(hostname: string): SiteResolutionResult {
  const site = getSiteByDomain(hostname);
  if (site) {
    return {
      siteId: site.id,
      verifiedSite: { slug: site.id, domain: site.domain, aliases: site.aliases },
    };
  }
  return { siteId: undefined, verifiedSite: null };
}

/**
 * Check if the hostname should be treated as a localhost dev pattern.
 */
export function isLocalhostDevHost(hostname: string): boolean {
  const hostWithoutPort = hostname.includes(":") ? hostname.split(":")[0] : hostname;
  const allowLocalhostInProd = process.env.ALLOW_LOCALHOST_FALLBACK_IN_PROD === "1";
  const previewAllowlistRaw = process.env.PREVIEW_HOST_ALLOWLIST ?? "";
  const previewAllowlist = previewAllowlistRaw
    ? new Set(previewAllowlistRaw.split(",").map((h) => h.trim().toLowerCase()))
    : null;

  return (
    (process.env.NODE_ENV !== "production" || allowLocalhostInProd) &&
    (hostWithoutPort === "localhost" || hostWithoutPort.endsWith(".localhost")) &&
    (!previewAllowlist || previewAllowlist.has(hostWithoutPort.toLowerCase()))
  );
}

/**
 * Rate-limit hostname resolution to prevent bot flood DB hammering.
 * Returns null if allowed, or an error NextResponse if blocked.
 */
export async function checkHostnameRateLimit(
  request: NextRequest,
  hostname: string,
): Promise<NextResponse | null> {
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

  return null;
}

/**
 * Check the KV negative cache for a hostname. Returns:
 *   - { cached: true, missCount } if the hostname is negative-cached
 *   - { cached: false } otherwise (also populates `positiveRow` if found)
 */
export async function checkKvCache(
  hostname: string,
  signal?: AbortSignal,
  throwIfAborted?: (signal?: AbortSignal) => void,
): Promise<{
  negativeHit: boolean;
  missCount: number;
  positiveRow: { id?: string; slug?: string; is_active?: boolean } | null;
}> {
  const cacheKey = `site-domain:${hostname}`;
  const negativeCacheKey = `site-domain-miss:${hostname}`;
  let negativeHit = false;
  let missCount = 0;
  let positiveRow: { id?: string; slug?: string; is_active?: boolean } | null = null;

  try {
    throwIfAborted?.(signal);
    const kv = getAppCacheKV();
    if (kv) {
      const negative = await kv.get(negativeCacheKey);
      if (negative === "1") {
        negativeHit = true;
        missCount = 1;
      } else if (negative) {
        try {
          const parsed = JSON.parse(negative) as { m?: number };
          if (parsed && typeof parsed.m === "number" && parsed.m > 0) {
            negativeHit = true;
            missCount = parsed.m;
          }
        } catch {
          // Corrupt entry — treat as a fresh miss
        }
      } else {
        positiveRow = (await kv.get(cacheKey, "json")) as typeof positiveRow;
      }
    }
  } catch (e) {
    logger.warn("[middleware] KV cache read failed", {
      hostname,
      error: e instanceof Error ? e.message : String(e),
    });
  }

  return { negativeHit, missCount, positiveRow };
}

/**
 * Bump the negative cache for a hostname miss.
 */
export async function writeNegativeCache(hostname: string, missCount: number): Promise<void> {
  const negativeCacheKey = `site-domain-miss:${hostname}`;
  const nextMissCount = missCount + 1;
  const ttlSeconds = getNegativeCacheTtlSeconds(nextMissCount);
  try {
    const kv = getAppCacheKV();
    if (kv) {
      await kv.put(negativeCacheKey, JSON.stringify({ m: nextMissCount }), {
        expirationTtl: ttlSeconds,
      });
    }
  } catch (e) {
    logger.warn("[middleware] KV negative-cache write failed", {
      hostname,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Write a positive cache entry for a resolved site.
 */
export async function writePositiveCache(
  hostname: string,
  row: { id?: string; slug?: string; is_active?: boolean },
): Promise<void> {
  const cacheKey = `site-domain:${hostname}`;
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

/**
 * Full dynamic site resolution for unknown hostnames.
 *
 * Checks KV cache → DB lookup → updates KV cache.
 * Returns the resolved SiteResolutionResult or an error response.
 */
export async function resolveDynamicSite(
  request: NextRequest,
  ctx: SiteResolutionContext,
): Promise<SiteResolutionResult | NextResponse> {
  // Rate-limit check
  try {
    ctx.throwIfAborted(ctx.signal);
    const rateLimitResponse = await checkHostnameRateLimit(request, ctx.hostname);
    if (rateLimitResponse) return rateLimitResponse;
  } catch (rlErr) {
    captureException(rlErr, {
      context: "middleware.hostname-resolve-rate-limit-failed",
      extra: { hostname: ctx.hostname },
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

  // Per-isolate flood guard
  const guardResult = recordUnknownHostKvAccess(ctx.hostname);
  if (!guardResult.allowed) {
    return ctx.nicheNotFoundResponse(request);
  }

  try {
    // Check KV cache
    const cache = await checkKvCache(ctx.hostname, ctx.signal, ctx.throwIfAborted);

    if (cache.negativeHit) {
      await writeNegativeCache(ctx.hostname, cache.missCount);
      return ctx.nicheNotFoundResponse(request);
    }

    ctx.throwIfAborted(ctx.signal);
    const row = cache.positiveRow || (await getMiddlewareSiteRowByDomain(ctx.hostname));
    ctx.throwIfAborted(ctx.signal);

    if (row && !cache.positiveRow) {
      await writePositiveCache(ctx.hostname, row);
    }

    if (row && row.is_active && row.slug) {
      return {
        siteId: row.slug,
        verifiedSite: { slug: row.slug, domain: ctx.hostname },
      };
    } else if (row && !row.is_active) {
      return ctx.nicheNotFoundResponse(request);
    } else if (!row) {
      await writeNegativeCache(ctx.hostname, 0);
    }

    return { siteId: undefined, verifiedSite: null };
  } catch (err) {
    logger.error("[middleware] DB lookup failed for domain", {
      hostname: ctx.hostname,
      traceId: ctx.traceId,
      err,
    });
    captureException(err, {
      context: "[middleware] getMiddlewareSiteRowByDomain",
      extra: { hostname: ctx.hostname, traceId: ctx.traceId },
    });

    return new NextResponse(
      JSON.stringify({
        error: "Service Temporarily Unavailable",
        message: "The platform is currently experiencing database connectivity issues.",
        traceId: ctx.traceId,
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
