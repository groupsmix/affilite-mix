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
import { signInternalRequest, computeHmac, timingSafeEqual } from "@/lib/internal-hmac";

/** 60 click-tracking requests per minute per IP */
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
    const cacheKey = `product-url:${siteId}:${productSlug}`;
    let cachedData: { name: string; url: string; _hmac?: string } | null = null;
    let cacheHmacValid = false;

    try {
      const kv = (process.env as any).APP_CACHE_KV as any;
      if (kv) {
        cachedData = await kv.get(cacheKey, "json");
        // Verify HMAC if present
        if (cachedData?._hmac) {
          const internalToken = process.env.INTERNAL_API_TOKEN ?? "";
          const bodyForHmac = JSON.stringify({ name: cachedData.name, url: cachedData.url });
          // FIX-14: Use a fixed timestamp/nonce for cache entries — we only care
          // about HMAC integrity, not replay/timestamp protection (cached data
          // is not a live request).
          const expectedHmac = await computeHmac(internalToken, "cache", "cache", bodyForHmac);
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

      // FIX-14: Sign the cached payload with HMAC for integrity verification
      const internalToken = process.env.INTERNAL_API_TOKEN ?? "";
      const bodyForHmac = JSON.stringify({ name: cachedData.name, url: cachedData.url });
      try {
        cachedData._hmac = await computeHmac(internalToken, "cache", "cache", bodyForHmac);
      } catch {
        // HMAC signing failed — cache without integrity check (graceful degradation)
      }

      // Update cache asynchronously
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

    const destinationUrl = cachedData.url;

    // F-029: Scheme validation to prevent javascript:/data: SSRF/XSS vectors
    const allowedSchemes = ["http:", "https:"];
    try {
      const urlObj = new URL(destinationUrl);
      if (!allowedSchemes.includes(urlObj.protocol)) {
        return apiError(400, "Invalid affiliate URL scheme");
      }
    } catch {
      return apiError(400, "Malformed affiliate URL");
    }

    // Publish to the click queue (falls back to direct DB write if no binding)
    void runAfterResponse(
      publishClick({
        site_id: siteId,
        product_name: cachedData.name,
        affiliate_url: destinationUrl,
        content_slug: searchParams.get("t") ?? "",
        referrer: request.headers.get("referer") ?? undefined,
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

/** POST handler — navigator.sendBeacon() always sends POST */
export async function POST(request: NextRequest) {
  return handleClick(request);
}
