import { NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/dal/affiliate-clicks";
import { getProductBySlug } from "@/lib/dal/products";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, rateLimitHeaders } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { getClientIp } from "@/lib/get-client-ip";

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

    // Validate product exists for this site
    const product = await getProductBySlug(siteId, productSlug);
    if (!product || !product.affiliate_url) {
      return apiError(404, "Product not found or has no affiliate URL");
    }

    // Always use the DB-stored affiliate URL, preventing open redirects.
    const destinationUrl = product.affiliate_url;

    // Record click (fire-and-forget)
    recordClick({
      site_id: siteId,
      product_name: product.name,
      affiliate_url: destinationUrl,
      content_slug: searchParams.get("t") ?? "",
      referrer: request.headers.get("referer") ?? undefined,
    });

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
