import { NextRequest, NextResponse } from "next/server";
import { publishClick } from "@/lib/click-queue";
import { getProductBySlug } from "@/lib/dal/products";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, rateLimitHeaders } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { getClientIp } from "@/lib/get-client-ip";
import { runAfterResponse } from "@/lib/wait-until";
import { computeHmac, timingSafeEqual } from "@/lib/internal-hmac";
import { validateAffiliateDomain } from "@/lib/affiliate-domain-allowlist";
import { logger } from "@/lib/logger";
import { isOriginAllowed } from "@/lib/security/allowed-origins";

/**
 * 60 click-tracking requests per minute per IP.
 *
 * G-17 (Apr 2026 audit): failPolicy was previously "open" — when KV was
 * unavailable we would silently skip rate limiting, letting an attacker
 * poison attribution by looping a single browser through the endpoint
 * thousands of times. We now use "grace", which falls back to the
 * in-memory limiter for KV_GRACE_MS before giving up. This keeps
 * request-time overhead identical for healthy KV while closing the
 * attribution-poisoning window during KV outages.
 */
const CLICK_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60 * 1000,
  failPolicy: "grace" as const,
};

/**
 * Shared handler for click tracking (used by both GET and POST).
 * POST support is needed because navigator.sendBeacon() always sends POST.
 */
async function handleClick(request: NextRequest) {
  try {
    // P0-3: In production, hard-fail EARLY if CLICK_CACHE_HMAC_KEY is missing.
    // Without it, HMAC signing cannot work and cached payloads would be
    // unsigned -- a cache poisoning vector. This check MUST run before any
    // cache reads or HMAC operations.
    // NEW-005: Use dedicated CLICK_CACHE_HMAC_KEY, decoupled from INTERNAL_API_TOKEN.
    const hmacKey = process.env.CLICK_CACHE_HMAC_KEY;
    if (process.env.NODE_ENV === "production" && !hmacKey) {
      captureException(new Error("CLICK_CACHE_HMAC_KEY missing in production click route"), {
        context: "[api/track/click] missing signing secret",
      });
      return apiError(503, "Service temporarily unavailable");
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`click:${ip}`, CLICK_RATE_LIMIT);
    if (!rl.allowed) {
      return apiError(429, "Rate limit exceeded", undefined, {
        "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        ...rateLimitHeaders(CLICK_RATE_LIMIT, rl),
      });
    }

    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    const { searchParams } = request.nextUrl;
    const productSlug = searchParams.get("p");

    if (!productSlug) {
      return apiError(400, "Missing required parameter: p");
    }

    // Validate product exists for this site and resolve affiliate URL
    // FIX-14 (F-024): HMAC integrity check for KV-cached affiliate URLs.
    // A compromised or corrupted KV could silently redirect clicks to
    // attacker-controlled URLs. We sign the cached payload with HMAC
    // using the INTERNAL_API_TOKEN so tampering is detectable.
    // F-API-09: Use a delimiter (\x1F) that cannot appear in a valid slug or UUID
    // to prevent cache key collisions across tenants.
    const cacheKey = `product-url\x1F${siteId}\x1F${productSlug}`;
    let cachedData: { name: string; url: string; _hmac?: string } | null = null;
    let cacheHmacValid = false;

    try {
      const kv = (process.env as any).APP_CACHE_KV as any;
      if (kv) {
        cachedData = await kv.get(cacheKey, "json");
        // P0-3: Verify HMAC on cached data. In production, reject unsigned
        // cached payloads (missing _hmac) to prevent cache poisoning.
        if (cachedData && !cachedData._hmac && process.env.NODE_ENV === "production") {
          console.error(
            JSON.stringify({
              metric: "affiliate_cache_unsigned_rejected",
              cacheKey,
              msg: "Unsigned cached affiliate payload rejected in production",
            }),
          );
          cachedData = null; // treat as cache miss
        }
        if (cachedData?._hmac) {
          // CF-03: Use dedicated CLICK_CACHE_HMAC_KEY so rotating
          // INTERNAL_API_TOKEN does not cause a cache stampede on Supabase.
          const bodyForHmac = JSON.stringify({ name: cachedData.name, url: cachedData.url });
          // FIX-14: Use a fixed timestamp/nonce for cache entries — we only care
          // about HMAC integrity, not replay/timestamp protection (cached data
          // is not a live request).
          const expectedHmac = await computeHmac(hmacKey || "", "cache", "cache", bodyForHmac);
          cacheHmacValid = timingSafeEqual(cachedData._hmac, expectedHmac);
          if (!cacheHmacValid) {
            console.error(
              JSON.stringify({
                metric: "affiliate_cache_hmac_mismatch",
                cacheKey,
                msg: "KV-cached affiliate URL failed HMAC check — possible cache poisoning",
              }),
            );
            cachedData = null; // treat as cache miss, re-fetch from DB
          }
        }
      }
    } catch (e) {
      // Ignore KV errors and fallback to DB
    }

    if (!cachedData) {
      const product = await getProductBySlug(siteId, productSlug);
      if (!product || !product.affiliate_url) {
        return apiError(404, "Product not found or has no affiliate URL");
      }
      cachedData = { name: product.name, url: product.affiliate_url };

      // P0-3 / CF-03: Sign the cached payload with dedicated HMAC key.
      // In production, unsigned payloads are NEVER cached to prevent cache poisoning.
      const bodyForHmac = JSON.stringify({ name: cachedData.name, url: cachedData.url });
      let hmacSigned = false;
      try {
        cachedData._hmac = await computeHmac(hmacKey || "", "cache", "cache", bodyForHmac);
        hmacSigned = true;
      } catch (hmacErr) {
        // P0-3: HMAC signing failed — do NOT cache unsigned payloads.
        console.error(
          JSON.stringify({
            metric: "affiliate_cache_hmac_sign_failed",
            cacheKey,
            msg: "Failed to sign affiliate cache payload — skipping cache write",
          }),
        );
        captureException(hmacErr, {
          context: "[api/track/click] HMAC signing failed",
          extra: { cacheKey },
        });
      }

      // P0-3: Only cache signed payloads — never persist unsigned data.
      if (hmacSigned) {
        try {
          const kv = (process.env as any).APP_CACHE_KV as any;
          if (kv) {
            void runAfterResponse(
              kv.put(cacheKey, JSON.stringify(cachedData), { expirationTtl: 3600 }),
              { context: "[api/track/click] cache product URL" },
            );
          }
        } catch (e) {}
      }
    }

    const destinationUrl = cachedData.url;

    // F-029: Scheme validation to prevent javascript:/data: SSRF/XSS vectors
    const allowedSchemes = ["http:", "https:"];
    let urlObj: URL;
    try {
      urlObj = new URL(destinationUrl);
      if (!allowedSchemes.includes(urlObj.protocol)) {
        return apiError(400, "Invalid affiliate URL scheme");
      }
    } catch {
      return apiError(400, "Malformed affiliate URL");
    }

    // T-09 / R-01: enforce the affiliate-domain allowlist at *redirect* time
    // as well as at write time. Behaviour matches AFFILIATE_DOMAIN_ENFORCEMENT:
    //   - "strict"  -> reject the redirect with a 400.
    //   - any other -> log a structured warning and continue.
    const domainCheck = validateAffiliateDomain(destinationUrl);
    if (!domainCheck.allowed) {
      logger.error("[track/click] rejected affiliate destination off allow-list", {
        siteId,
        productSlug,
        domain: domainCheck.domain,
        reason: domainCheck.reason,
      });
      // Structured metric for alerting / dashboards.
      console.error(
        JSON.stringify({
          metric: "affiliate_destination_rejected",
          site_id: siteId,
          product_slug: productSlug,
          domain: domainCheck.domain,
          reason: domainCheck.reason,
        }),
      );
      captureException(new Error(`Blocked unapproved affiliate redirect: ${urlObj.hostname}`), {
        context: "[api/track/click] unapproved redirect host",
        extra: { url: destinationUrl, reason: domainCheck.reason },
      });
      return apiError(400, "Affiliate destination is not allowed");
    }
    if (domainCheck.reason) {
      // `allowed: true` with a `reason` means warn-mode tolerated an
      // off-list domain. Emit a structured warning so the corpus can
      // be audited before AFFILIATE_DOMAIN_ENFORCEMENT=strict ships.
      console.warn(
        JSON.stringify({
          metric: "affiliate_destination_warn",
          site_id: siteId,
          product_slug: productSlug,
          domain: domainCheck.domain,
          reason: domainCheck.reason,
        }),
      );
    }

    // F-DB-03: Strip query strings and fragments from referrer for privacy
    // to avoid capturing PII, session tokens, or sensitive search terms.
    let sanitizedReferrer = request.headers.get("referer") || undefined;
    if (sanitizedReferrer) {
      try {
        const refUrl = new URL(sanitizedReferrer);
        sanitizedReferrer = `${refUrl.origin}${refUrl.pathname}`.slice(0, 2048);
      } catch {
        sanitizedReferrer = sanitizedReferrer.slice(0, 2048);
      }
    }

    // Publish to the click queue (falls back to direct DB write if no binding)
    void runAfterResponse(
      publishClick({
        site_id: siteId,
        product_name: cachedData.name,
        affiliate_url: destinationUrl,
        content_slug: searchParams.get("t") ?? "",
        referrer: sanitizedReferrer,
      }),
      { context: "[api/track/click] publishClick" },
    );

    // 302 redirect to the product's affiliate URL
    return NextResponse.redirect(destinationUrl, 302);
  } catch (err) {
    captureException(err, { context: "[api/track/click] failed:" });
    return apiError(500, "Internal server error");
  }
}

export async function GET(request: NextRequest) {
  return handleClick(request);
}

/**
 * POST handler — navigator.sendBeacon() always sends POST.
 *
 * FRESH-03: POST (sendBeacon) requests always carry an Origin header, so
 * we can enforce the per-site allow-list here as the compensating control
 * documented in lib/security/csrf-exempt-registry.ts. GET requests are
 * top-level link navigation — they have no Origin and we intentionally
 * allow them (the primary click-redirect use-case).
 */
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const siteId = request.headers.get("x-site-id");
  if (!isOriginAllowed(origin, request.headers.get("host"), siteId)) {
    return new NextResponse("Forbidden origin", { status: 403 });
  }
  return handleClick(request);
}
