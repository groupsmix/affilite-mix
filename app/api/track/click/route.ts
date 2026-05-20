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
import { verifyToken } from "@/lib/auth";

const CLICK_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60 * 1000,
  failPolicy: "grace" as const,
};

async function hasValidAdminSession(request: NextRequest): Promise<boolean> {
  const adminToken = request.cookies.get("nh_admin_token")?.value;
  if (!adminToken) return false;
  try {
    const payload = await verifyToken(adminToken, request);
    return !!payload;
  } catch {
    return false;
  }
}

async function handleClick(request: NextRequest) {
  try {
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

    const cacheKey = `product-url\x1F${siteId}\x1F${productSlug}`;
    let cachedData: { name: string; url: string; _hmac?: string } | null = null;
    let cacheHmacValid = false;

    try {
      const kv = (process.env as any).APP_CACHE_KV as any;
      if (kv) {
        cachedData = await kv.get(cacheKey, "json");
        if (cachedData && !cachedData._hmac && process.env.NODE_ENV === "production") {
          console.error(
            JSON.stringify({
              metric: "affiliate_cache_unsigned_rejected",
              cacheKey,
              msg: "Unsigned cached affiliate payload rejected in production",
            }),
          );
          cachedData = null;
        }
        if (cachedData?._hmac) {
          const bodyForHmac = JSON.stringify({ name: cachedData.name, url: cachedData.url });
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
            cachedData = null;
          }
        }
      }
    } catch {
      // Ignore KV errors and fallback to DB
    }

    if (!cachedData) {
      const product = await getProductBySlug(siteId, productSlug);
      if (!product || !product.affiliate_url) {
        return apiError(404, "Product not found or has no affiliate URL");
      }
      cachedData = { name: product.name, url: product.affiliate_url };

      const bodyForHmac = JSON.stringify({ name: cachedData.name, url: cachedData.url });
      let hmacSigned = false;
      try {
        cachedData._hmac = await computeHmac(hmacKey || "", "cache", "cache", bodyForHmac);
        hmacSigned = true;
      } catch (hmacErr) {
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

      if (hmacSigned) {
        try {
          const kv = (process.env as any).APP_CACHE_KV as any;
          if (kv) {
            void runAfterResponse(
              kv.put(cacheKey, JSON.stringify(cachedData), { expirationTtl: 3600 }),
              { context: "[api/track/click] cache product URL" },
            );
          }
        } catch {
          // ignore cache write errors
        }
      }
    }

    const destinationUrl = cachedData.url;
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

    const domainCheck = validateAffiliateDomain(destinationUrl);
    if (!domainCheck.allowed) {
      logger.error("[track/click] rejected affiliate destination off allow-list", {
        siteId,
        productSlug,
        domain: domainCheck.domain,
        reason: domainCheck.reason,
      });
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

    let sanitizedReferrer = request.headers.get("referer") || undefined;
    if (sanitizedReferrer) {
      try {
        const refUrl = new URL(sanitizedReferrer);
        sanitizedReferrer = `${refUrl.origin}${refUrl.pathname}`.slice(0, 2048);
      } catch {
        sanitizedReferrer = sanitizedReferrer.slice(0, 2048);
      }
    }

    const isInternal = await hasValidAdminSession(request);

    void runAfterResponse(
      publishClick({
        site_id: siteId,
        product_name: cachedData.name,
        affiliate_url: destinationUrl,
        content_slug: searchParams.get("t") ?? "",
        referrer: sanitizedReferrer,
        is_internal: isInternal,
      }),
      { context: "[api/track/click] publishClick" },
    );

    return NextResponse.redirect(destinationUrl, 302);
  } catch (err) {
    captureException(err, { context: "[api/track/click] failed:" });
    return apiError(500, "Internal server error");
  }
}

export async function GET(request: NextRequest) {
  return handleClick(request);
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const siteId = request.headers.get("x-site-id");
  if (!isOriginAllowed(origin, request.headers.get("host"), siteId)) {
    return new NextResponse("Forbidden origin", { status: 403 });
  }
  return handleClick(request);
}
