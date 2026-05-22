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

/**
 * A162: Extract the /24 prefix from an IP address for privacy-preserving analytics.
 * IPv4: "203.0.113.42" → "203.0.113"
 * IPv6: "2001:db8::1"  → "2001:db8::" (first 48 bits / 3 groups)
 * Returns null for unrecognized formats.
 */
function getIpPrefix(ip: string): string | null {
  if (!ip) return null;
  // IPv4
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) return parts.slice(0, 3).join(".");
  }
  // IPv6 — keep first 3 colon-separated groups
  if (ip.includes(":")) {
    const groups = ip.split(":");
    return groups.slice(0, 3).join(":") + "::";
  }
  return null;
}

/**
 * A158: Compute a privacy-preserving click fingerprint for 24-hour dedup.
 * Inputs: HMAC key + site_id + content_slug (campaign) + ip_prefix + UA hash.
 * The fingerprint is an HMAC — no raw PII leaves this function.
 */
async function computeClickFingerprint(
  hmacKey: string,
  siteId: string,
  contentSlug: string,
  ipPrefix: string,
  userAgent: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const uaHashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(userAgent));
  const uaHash = Array.from(new Uint8Array(uaHashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16); // truncated — sufficient for dedup, not reversible to UA
  const payload = `${siteId}\x1F${contentSlug}\x1F${ipPrefix}\x1F${uaHash}`;
  return computeHmac(hmacKey, "click-dedup", "click-dedup", payload);
}

/**
 * A158: Check KV for a dedup key. Returns true if this click is a duplicate
 * within the 24-hour window. Writes the dedup key on a cache miss.
 * Fail-open: any KV error allows the click through.
 */
async function isDuplicateClick(
  fingerprint: string,
  siteId: string,
  contentSlug: string,
): Promise<boolean> {
  try {
    const kv = (process.env as any).APP_CACHE_KV as any;
    if (!kv) return false;
    const dedupKey = `click-dedup\x1F${siteId}\x1F${contentSlug}\x1F${fingerprint}`;
    const existing = await kv.get(dedupKey);
    if (existing !== null) return true;
    // 24-hour TTL — matches the dedup window from A158
    await kv.put(dedupKey, "1", { expirationTtl: 86400 });
    return false;
  } catch {
    return false; // fail-open: never drop a legitimate click due to KV error
  }
}

const CLICK_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
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
    const contentSlug = searchParams.get("t") ?? "";

    // A162: Store only the /24 prefix — full IP is never written to DB.
    const ipPrefix = getIpPrefix(ip) ?? "";

    // A158: Compute fingerprint and check 24h dedup window for non-internal clicks.
    let fingerprint: string | undefined;
    if (!isInternal && hmacKey) {
      try {
        const userAgent = request.headers.get("user-agent") ?? "";
        fingerprint = await computeClickFingerprint(
          hmacKey,
          siteId,
          contentSlug,
          ipPrefix,
          userAgent,
        );
        const isDup = await isDuplicateClick(fingerprint, siteId, contentSlug);
        if (isDup) {
          // Duplicate click within 24h window: still redirect but don't count it.
          logger.info("[track/click] duplicate click suppressed", {
            site_id: siteId,
            content_slug: contentSlug,
          });
          return NextResponse.redirect(destinationUrl, 302);
        }
      } catch (fingerprintErr) {
        // Fail-open: fingerprint errors must not drop legitimate clicks
        captureException(fingerprintErr, {
          context: "[api/track/click] fingerprint computation failed",
        });
        fingerprint = undefined;
      }
    }

    void runAfterResponse(
      publishClick({
        site_id: siteId,
        product_name: cachedData.name,
        affiliate_url: destinationUrl,
        content_slug: contentSlug,
        referrer: sanitizedReferrer,
        is_internal: isInternal,
        ip_prefix: ipPrefix || undefined,
        fingerprint,
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
