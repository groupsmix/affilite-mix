import { NextRequest, NextResponse } from "next/server";
import { publishClick } from "@/lib/click-queue";
import { getProductBySlug } from "@/lib/dal/products";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { getClientIp, getIpPrefix } from "@/lib/get-client-ip";
import { runAfterResponse } from "@/lib/wait-until";
import { computeHmac, timingSafeEqual } from "@/lib/internal-hmac";
import { validateAffiliateDomain } from "@/lib/affiliate-domain-allowlist";
import { logger } from "@/lib/logger";
import { getAppCacheKV } from "@/lib/runtime-env";
import { getOrDeriveHmacKeyString } from "@/lib/hmac-key";
import { isOriginAllowedForSite } from "@/lib/security/allowed-origins";
import { isHttpsUrl } from "@/lib/validation";
import {
  computeClickFingerprint,
  hasValidAdminSession,
  isDuplicateClick,
  safeKeyPart,
  sanitizeClickReferrer,
  shouldSkipClickAnalytics,
} from "@/lib/click-analytics";
import {
  normalizeOverrideUrl,
  validateOverrideDestination,
} from "@/lib/affiliate/override-url-guard";

/**
 * AUDIT-FIX A4-001/A2-002: Validate and sanitize slug inputs.
 * Rejects null bytes, delimiter chars, and enforces length + charset.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s.normalize("NFC"));
}

const CLICK_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
};

async function handleClick(request: NextRequest, opts: { skipAnalytics?: boolean } = {}) {
  try {
    // H-12: Prefer derived HMAC key via HKDF. Fall back to the env var
    // for backward compatibility during migration.
    //
    // audit5-#34: switched from `deriveHmacKey` to the cached
    // `getOrDeriveHmacKey`. The derivation is a one-time HKDF that
    // produces a stable purpose-specific subkey from JWT_SECRET; the
    // result is safe to memoise process-wide because (a) the master
    // secret is fixed for the lifetime of the isolate, and (b)
    // CryptoKey objects are extractable=false, so the cache hands out
    // an opaque handle, not raw key material. On hot paths (e.g.
    // 100 clicks/s) this drops the per-request HMAC import+derive
    // from O(ms) to O(ns).
    // H-12 + audit #4: Resolve a signing secret for 24h click dedup + the
    // product-url cache MAC. Prefer the explicit env var; otherwise DERIVE and
    // ACTUALLY USE a stable HKDF subkey. Previously the derived key was computed
    // and thrown away, so whenever CLICK_CACHE_HMAC_KEY was unset both dedup and
    // cache signing silently turned off (inflated click counts / unsigned cache).
    // Now dedup only disables if BOTH the env var is unset AND derivation fails.
    let hmacKey = process.env.CLICK_CACHE_HMAC_KEY;
    if (!hmacKey) {
      try {
        hmacKey = await getOrDeriveHmacKeyString("click-cache");
      } catch {
        if (process.env.NODE_ENV === "production") {
          captureException(new Error("CLICK_CACHE_HMAC_KEY unset and HKDF derivation failed"), {
            context: "[api/track/click] no signing secret available",
          });
          return apiError(503, "Service temporarily unavailable", undefined, {
            "Retry-After": "30",
          });
        }
      }
    }

    const ip = getClientIp(request);
    // API-03: Rate limit gates analytics recording, not the redirect itself.
    // Users should always reach the affiliate URL — only the tracking write
    // is suppressed when the limit is exceeded, preventing revenue loss
    // during KV outages or traffic spikes.
    const rl = await checkRateLimit(`click:${ip}`, CLICK_RATE_LIMIT);
    const rateLimited = !rl.allowed;

    // AUDIT-FIX A4-007: Validate x-site-id header length and charset
    const rawSiteHeader = request.headers.get("x-site-id") ?? "";
    if (
      rawSiteHeader.length > 64 ||
      (rawSiteHeader && !/^[a-z0-9][a-z0-9._-]*$/i.test(rawSiteHeader))
    ) {
      return apiError(400, "Invalid site identifier");
    }
    const siteSlug = getSiteIdFromHeader(rawSiteHeader);
    const siteId = await resolveDbSiteId(siteSlug);
    const { searchParams } = request.nextUrl;
    const productSlug = (searchParams.get("p") ?? "").normalize("NFC");
    const rawOverrideUrl = searchParams.get("u");
    const overrideUrl = rawOverrideUrl ? normalizeOverrideUrl(rawOverrideUrl) : null;
    const overrideName = searchParams.get("n") ?? undefined;

    if (rawOverrideUrl && !overrideUrl) {
      return apiError(400, "Malformed affiliate URL");
    }

    if (!productSlug) {
      return apiError(400, "Missing required parameter: p");
    }

    // AUDIT-FIX A1-001/A4-001: Validate slug format before cache/DB use
    if (!isValidSlug(productSlug)) {
      return apiError(400, "Invalid product slug");
    }

    const matchedProduct = await getProductBySlug(siteId, productSlug);
    const cacheKey = `product-url:${safeKeyPart(siteId)}:${safeKeyPart(productSlug)}`;
    let cachedData: { name: string; url: string; _hmac?: string } | null = null;
    let cacheHmacValid = false;

    // A dial/guide/watch configuration may supply the affiliate URL and display
    // name directly instead of requiring a product row in the database. The URL
    // is validated by the same destination checks below.
    if (overrideUrl) {
      // A destination supplied by the caller is only as trustworthy as the
      // caller. The allow-list below bounds the host; this bounds the rest.
      const overrideCheck = validateOverrideDestination(overrideUrl);
      if (!overrideCheck.allowed) {
        logger.error("affiliate_override_destination_rejected", {
          site_id: siteId,
          product_slug: productSlug,
          reason: overrideCheck.reason,
        });
        captureException(new Error(`Blocked affiliate override: ${overrideCheck.reason}`), {
          context: "[api/track/click] rejected override destination",
          extra: { reason: overrideCheck.reason },
        });
        return apiError(400, "Affiliate destination is not allowed");
      }

      const safeName = (overrideName ?? productSlug)
        .normalize("NFC")
        .replace(/[\x00\x1F]/g, "")
        .slice(0, 512);
      cachedData = { name: safeName, url: overrideUrl };
    } else {
      try {
        const kv = getAppCacheKV();
        if (kv) {
          cachedData = (await kv.get(cacheKey, "json")) as {
            name: string;
            url: string;
            _hmac?: string;
          } | null;
          if (cachedData && !cachedData._hmac) {
            logger.error("affiliate_cache_unsigned_rejected", {
              cacheKey,
            });
            cachedData = null;
          }
          if (cachedData?._hmac && hmacKey) {
            const bodyForHmac = JSON.stringify({ name: cachedData.name, url: cachedData.url });
            const expectedHmac = await computeHmac(hmacKey, "cache", "cache", bodyForHmac);
            cacheHmacValid = timingSafeEqual(cachedData._hmac, expectedHmac);
            if (!cacheHmacValid) {
              logger.error("affiliate_cache_hmac_mismatch", {
                cacheKey,
              });
              cachedData = null;
            }
          }
        }
      } catch {
        // fail-open: best-effort [criticality:non-critical]
        // Ignore KV errors and fallback to DB
      }

      if (!cachedData) {
        if (!matchedProduct || !matchedProduct.affiliate_url) {
          return apiError(404, "Product not found or has no affiliate URL");
        }
        cachedData = { name: matchedProduct.name, url: matchedProduct.affiliate_url };

        const bodyForHmac = JSON.stringify({ name: cachedData.name, url: cachedData.url });
        let hmacSigned = false;
        if (!hmacKey) {
          // A8-002: Never cache unsigned destinations — empty HMAC key means
          // the cached payload cannot be integrity-checked on read, allowing
          // cache poisoning via a spoofed KV entry.
          logger.warn("[track/click] skipping cache write: CLICK_CACHE_HMAC_KEY is empty");
        }
        try {
          if (hmacKey) {
            cachedData._hmac = await computeHmac(hmacKey, "cache", "cache", bodyForHmac);
            hmacSigned = true;
          }
        } catch (hmacErr) {
          logger.error("affiliate_cache_hmac_sign_failed", {
            cacheKey,
          });
          captureException(hmacErr, {
            context: "[api/track/click] HMAC signing failed",
            extra: { cacheKey },
          });
        }

        if (hmacSigned) {
          try {
            const kv = getAppCacheKV();
            if (kv) {
              void runAfterResponse(
                kv.put(cacheKey, JSON.stringify(cachedData), { expirationTtl: 3600 }),
                { context: "[api/track/click] cache product URL" },
              );
            }
          } catch {
            // fail-open: best-effort [criticality:non-critical]
            // ignore cache write errors
          }
        }
      }
    }

    const destinationUrl = cachedData.url;
    let urlObj: URL;
    try {
      urlObj = new URL(destinationUrl);
      if (!isHttpsUrl(destinationUrl)) {
        return apiError(400, "Invalid affiliate URL scheme");
      }
    } catch {
      // fail-open: best-effort [criticality:non-critical]
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
      logger.error("affiliate_destination_rejected", {
        site_id: siteId,
        product_slug: productSlug,
        domain: domainCheck.domain,
        reason: domainCheck.reason,
      });
      captureException(new Error(`Blocked unapproved affiliate redirect: ${urlObj.hostname}`), {
        context: "[api/track/click] unapproved redirect host",
        extra: { url: destinationUrl, reason: domainCheck.reason },
      });
      return apiError(400, "Affiliate destination is not allowed");
    }
    if (domainCheck.reason) {
      logger.warn("affiliate_destination_warn", {
        site_id: siteId,
        product_slug: productSlug,
        domain: domainCheck.domain,
        reason: domainCheck.reason,
      });
    }

    const sanitizedReferrer = sanitizeClickReferrer(request.headers.get("referer"));

    const isInternal = await hasValidAdminSession(request, siteId);
    // AUDIT-FIX A1-003/A4-002: Validate and cap content slug
    const rawContentSlug = (searchParams.get("t") ?? "")
      .normalize("NFC")
      .replace(/[\x00\x1F]/g, "")
      .slice(0, 128);
    // RC-003: Validate contentSlug charset (empty is allowed for backwards compat)
    if (rawContentSlug && !SLUG_RE.test(rawContentSlug)) {
      return apiError(400, "Invalid content slug");
    }

    // placement and campaign let us attribute clicks to a specific CTA and campaign.
    // They are stored alongside the content slug in a pipe-delimited form so the
    // existing affiliate_clicks table does not need new columns.
    const rawPlacement = (searchParams.get("pl") ?? "")
      .normalize("NFC")
      .replace(/[\x00\x1F\|]/g, "")
      .slice(0, 64);
    const rawCampaign = (searchParams.get("c") ?? "")
      .normalize("NFC")
      .replace(/[\x00\x1F\|]/g, "")
      .slice(0, 64);
    if (
      (rawPlacement && !SLUG_RE.test(rawPlacement)) ||
      (rawCampaign && !SLUG_RE.test(rawCampaign))
    ) {
      return apiError(400, "Invalid placement or campaign parameter");
    }

    const contentSlugParts = [rawContentSlug];
    if (rawPlacement) contentSlugParts.push(`pl:${rawPlacement}`);
    if (rawCampaign) contentSlugParts.push(`c:${rawCampaign}`);
    const contentSlug = contentSlugParts.join("|").slice(0, 160);

    // A162: Store only the /24 prefix — full IP is never written to DB.
    const ipPrefix = getIpPrefix(ip) ?? "";

    // AUDIT-FIX A3-002: Skip analytics mutations for cross-site GET requests.
    // POST (sendBeacon) still records clicks because it passes Origin validation.
    // API-03: Also skip analytics when rate-limited — redirect still fires.
    if (!opts.skipAnalytics && !rateLimited) {
      // A158: Compute fingerprint and check 24h dedup window for non-internal clicks.
      let fingerprint: string | undefined;
      if (!isInternal && hmacKey) {
        try {
          const userAgent = request.headers.get("user-agent") ?? "";
          fingerprint = await computeClickFingerprint(
            hmacKey,
            siteId,
            productSlug,
            contentSlug,
            ipPrefix,
            userAgent,
          );
          const dedupResult = await isDuplicateClick(fingerprint, siteId, productSlug, contentSlug);
          if (dedupResult === "duplicate") {
            logger.info("[track/click] duplicate click suppressed", {
              site_id: siteId,
              content_slug: contentSlug,
            });
            return NextResponse.redirect(destinationUrl, 302); // nosemgrep
          }
          // AUDIT-FIX A5-005/A7-004/A11-006: Fail analytics closed on dedup error.
          // Still redirect, but skip recording to prevent inflated metrics.
          if (dedupResult === "error") {
            logger.warn("[track/click] dedup KV error — skipping analytics, still redirecting", {
              site_id: siteId,
              content_slug: contentSlug,
            });
            return NextResponse.redirect(destinationUrl, 302); // nosemgrep
          }
        } catch (fingerprintErr) {
          // AUDIT-FIX A11-006: Fail analytics closed on fingerprint error too
          captureException(fingerprintErr, {
            context: "[api/track/click] fingerprint computation failed",
          });
          return NextResponse.redirect(destinationUrl, 302); // nosemgrep
        }
      }

      const clickPromise = publishClick({
        site_id: siteId,
        product_name: cachedData.name,
        affiliate_url: destinationUrl,
        ...(matchedProduct ? { product_id: matchedProduct.id } : {}),
        content_slug: contentSlug,
        referrer: sanitizedReferrer,
        is_internal: isInternal,
        ip_prefix: ipPrefix || undefined,
        fingerprint,
      });
      // In edge runtime (Cloudflare Workers) the response is streamed without
      // waiting; everywhere else we await to ensure the write completes before
      // the process exits (important for tests and serverless cold-shutdown).
      if ("__CLOUDFLARE_WORKERS__" in globalThis) {
        void runAfterResponse(clickPromise, { context: "[api/track/click] publishClick" });
      } else {
        await clickPromise.catch((err: unknown) =>
          captureException(err, { context: "[api/track/click] publishClick" }),
        );
      }
    }

    return NextResponse.redirect(destinationUrl, 302); // nosemgrep
  } catch (err) {
    captureException(err, { context: "[api/track/click] failed:" });
    return apiError(500, "Internal server error");
  }
}

// AUDIT-FIX A3-002: GET requests may be triggered cross-site (image tags,
// prefetch, embed, etc.) without user activation. Only top-level trusted
// navigations may record analytics — see `shouldSkipClickAnalytics`, shared
// with /r/[shortcode] so both outbound paths count clicks identically.
export async function GET(request: NextRequest) {
  return handleClick(request, { skipAnalytics: shouldSkipClickAnalytics(request) });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const siteId = request.headers.get("x-site-id");
  // A97: Use strict per-site origin validation for click tracking.
  // Prevents cross-tenant telemetry spoofing from other allowed origins.
  if (!isOriginAllowedForSite(origin, siteId, request.headers.get("host"))) {
    return new NextResponse("Forbidden origin", { status: 403 });
  }
  return handleClick(request);
}
