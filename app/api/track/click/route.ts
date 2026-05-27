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
import { getAppCacheKV } from "@/lib/runtime-env";
import { deriveHmacKey } from "@/lib/hmac-key";
import { isOriginAllowedForSite } from "@/lib/security/allowed-origins";
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
 * AUDIT-FIX A4-001/A2-002: Validate and sanitize slug inputs.
 * Rejects null bytes, delimiter chars, and enforces length + charset.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
function isValidSlug(s: string): boolean {
  return SLUG_RE.test(s.normalize("NFC"));
}

/** AUDIT-FIX A2-002: Strip \x1F delimiters from user input to prevent KV key collision. */
function safeKeyPart(s: string): string {
  return s.replace(/[\x1F\x00]/g, "").slice(0, 160);
}

/**
 * A158: Check KV for a dedup key. Returns "duplicate" if this click is a duplicate
 * within the 24-hour window. Returns "unique" on a cache miss.
 * AUDIT-FIX A5-005/A7-004/A11-006: Returns "error" on KV failure so callers
 * can fail analytics closed while still redirecting.
 */
async function isDuplicateClick(
  fingerprint: string,
  siteId: string,
  contentSlug: string,
): Promise<"duplicate" | "unique" | "error"> {
  try {
    const kv = getAppCacheKV();
    if (!kv) return "unique";
    const dedupKey = `click-dedup:${safeKeyPart(siteId)}:${safeKeyPart(contentSlug)}:${fingerprint}`;
    const existing = await kv.get(dedupKey);
    if (existing !== null) return "duplicate";
    await kv.put(dedupKey, "1", { expirationTtl: 86400 });
    return "unique";
  } catch {
    // fail-open: best-effort
    return "error";
  }
}

const CLICK_RATE_LIMIT = {
  maxRequests: 60,
  windowMs: 60 * 1000,
  failPolicy: "closed" as const,
};

/**
 * AUDIT-FIX A3-006/A6-003: Validate admin session AND bind to the resolved siteId
 * so an admin from tenant A cannot suppress analytics on tenant B's clicks.
 */
async function hasValidAdminSession(request: NextRequest, siteId?: string): Promise<boolean> {
  const adminToken =
    request.cookies.get("__Host-nh_admin_token")?.value ??
    request.cookies.get("nh_admin_token")?.value;
  if (!adminToken) return false;
  try {
    const payload = await verifyToken(adminToken, request);
    if (!payload) return false;
    // RC-001: Require token to carry a site_id claim that matches the resolved tenant.
    // Tokens without site_id (legacy/older) must NOT be treated as internal.
    const tokenSiteId = (payload as unknown as Record<string, unknown>).site_id as
      | string
      | undefined;
    if (siteId && tokenSiteId !== siteId) {
      return false;
    }
    return true;
  } catch {
    // fail-open: best-effort
    return false;
  }
}

async function handleClick(request: NextRequest, opts: { skipAnalytics?: boolean } = {}) {
  try {
    // H-12: Prefer derived HMAC key via HKDF. Fall back to the env var
    // for backward compatibility during migration.
    const hmacKey = process.env.CLICK_CACHE_HMAC_KEY;
    let clickHmacKey: CryptoKey | null = null;
    try {
      clickHmacKey = await deriveHmacKey("click-cache", ["sign", "verify"]);
    } catch {
      if (process.env.NODE_ENV === "production" && !hmacKey) {
        captureException(new Error("CLICK_CACHE_HMAC_KEY missing and deriveHmacKey failed"), {
          context: "[api/track/click] missing signing secret",
        });
        return apiError(503, "Service temporarily unavailable");
      }
    }

    const ip = getClientIp(request);
    const rl = await checkRateLimit(`click:${ip}`, CLICK_RATE_LIMIT);
    if (!rl.allowed) {
      return apiError(429, "Rate limit exceeded", undefined, {
        "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        ...rateLimitHeaders(CLICK_RATE_LIMIT, rl),
      });
    }

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

    if (!productSlug) {
      return apiError(400, "Missing required parameter: p");
    }

    // AUDIT-FIX A1-001/A4-001: Validate slug format before cache/DB use
    if (!isValidSlug(productSlug)) {
      return apiError(400, "Invalid product slug");
    }

    const cacheKey = `product-url:${safeKeyPart(siteId)}:${safeKeyPart(productSlug)}`;
    let cachedData: { name: string; url: string; _hmac?: string } | null = null;
    let cacheHmacValid = false;

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
      // fail-open: best-effort
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
          // fail-open: best-effort
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
      // fail-open: best-effort
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

    // AUDIT-FIX A4-003/A7-006: Slice referrer before parsing to bound memory, strip CR/LF
    let sanitizedReferrer = request.headers.get("referer") || undefined;
    if (sanitizedReferrer) {
      sanitizedReferrer = sanitizedReferrer.replace(/[\r\n\0]/g, "").slice(0, 2048);
      try {
        const refUrl = new URL(sanitizedReferrer);
        sanitizedReferrer = `${refUrl.origin}${refUrl.pathname}`.slice(0, 2048);
      } catch {
        // fail-open: best-effort
        sanitizedReferrer = sanitizedReferrer.slice(0, 2048);
      }
    }

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
    const contentSlug = rawContentSlug;

    // A162: Store only the /24 prefix — full IP is never written to DB.
    const ipPrefix = getIpPrefix(ip) ?? "";

    // AUDIT-FIX A3-002: Skip analytics mutations for cross-site GET requests.
    // POST (sendBeacon) still records clicks because it passes Origin validation.
    if (!opts.skipAnalytics) {
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
          const dedupResult = await isDuplicateClick(fingerprint, siteId, contentSlug);
          if (dedupResult === "duplicate") {
            logger.info("[track/click] duplicate click suppressed", {
              site_id: siteId,
              content_slug: contentSlug,
            });
            return NextResponse.redirect(destinationUrl, 302);
          }
          // AUDIT-FIX A5-005/A7-004/A11-006: Fail analytics closed on dedup error.
          // Still redirect, but skip recording to prevent inflated metrics.
          if (dedupResult === "error") {
            logger.warn("[track/click] dedup KV error — skipping analytics, still redirecting", {
              site_id: siteId,
              content_slug: contentSlug,
            });
            return NextResponse.redirect(destinationUrl, 302);
          }
        } catch (fingerprintErr) {
          // AUDIT-FIX A11-006: Fail analytics closed on fingerprint error too
          captureException(fingerprintErr, {
            context: "[api/track/click] fingerprint computation failed",
          });
          return NextResponse.redirect(destinationUrl, 302);
        }
      }

      const clickPromise = publishClick({
        site_id: siteId,
        product_name: cachedData.name,
        affiliate_url: destinationUrl,
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

    return NextResponse.redirect(destinationUrl, 302);
  } catch (err) {
    captureException(err, { context: "[api/track/click] failed:" });
    return apiError(500, "Internal server error");
  }
}

// AUDIT-FIX A3-002: GET requests may be triggered cross-site (image tags,
// prefetch, embed, etc.) without user activation. Only top-level trusted
// navigations ("none", "same-origin", "same-site") may record analytics.
// Missing Sec-Fetch-Site means the browser did not send the header at all
// (e.g. prefetch pipelines, crawlers) — treat as untrusted.
export async function GET(request: NextRequest) {
  const secFetchSite = request.headers.get("sec-fetch-site");
  const secFetchDest = request.headers.get("sec-fetch-dest");
  // Only "none" (direct nav / email link) or same-origin/same-site navigations
  // are trusted top-level user actions.
  const trustedNavigation =
    secFetchSite === "none" || secFetchSite === "same-origin" || secFetchSite === "same-site";
  // Skip analytics for any non-document sub-resource request even if it
  // somehow arrives with a trusted site value.
  const skipAnalytics =
    !trustedNavigation || (secFetchDest !== null && secFetchDest !== "document");
  return handleClick(request, { skipAnalytics });
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
