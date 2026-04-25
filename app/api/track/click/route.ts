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

/** 60 click-tracking requests per minute per IP */
const CLICK_RATE_LIMIT = { maxRequests: 60, windowMs: 60 * 1000 };

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
    // F-011: Use KV cache to avoid synchronous DB read on every click
    const cacheKey = `product-url:${siteId}:${productSlug}`;
    let cachedData: { name: string; url: string } | null = null;

    try {
      const kv = (process.env as any).RATE_LIMIT_KV as any;
      if (kv) {
        cachedData = await kv.get(cacheKey, "json");
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

      // Update cache asynchronously
      try {
        const kv = (process.env as any).RATE_LIMIT_KV as any;
        if (kv) {
          void runAfterResponse(
            kv.put(cacheKey, JSON.stringify(cachedData), { expirationTtl: 3600 }),
            { context: "[api/track/click] cache product URL" },
          );
        }
      } catch (e) {}
    }

    const destinationUrl = cachedData.url;

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
