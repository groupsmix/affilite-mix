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
import { verifyToken } from "@/lib/auth";
import { isHttpsUrl } from "@/lib/validation";

/**
 * A158: Compute a privacy-preserving click fingerprint for 24-hour dedup.
 * Inputs: HMAC key + site_id + product_slug + content_slug (campaign) + ip_prefix + UA hash.
 * The fingerprint is an HMAC — no raw PII leaves this function.
 */
async function computeClickFingerprint(
  hmacKey: string,
  siteId: string,
  productSlug: string,
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
  const payload = `${siteId}\x1F${productSlug}\x1F${contentSlug}\x1F${ipPrefix}\x1F${uaHash}`;
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
/**
 * A99-3: KV write-rate monitoring for click dedup.
 * Tracks per-minute write count and emits a warning when the rate
 * exceeds the configurable threshold (KV_DEDUP_WRITE_ALERT_RATE,
 * default 500 writes/min).
 */
let _kvDedupWriteCount = 0;
let _kvDedupWriteWindowStart = Date.now();
const KV_DEDUP_WRITE_WINDOW_MS = 60_000;
function trackKvDedupWrite(): void {
  const now = Date.now();
  if (now - _kvDedupWriteWindowStart >= KV_DEDUP_WRITE_WINDOW_MS) {
    _kvDedupWriteCount = 0;
    _kvDedupWriteWindowStart = now;
  }
  _kvDedupWriteCount++;

  const threshold = Number(process.env.KV_DEDUP_WRITE_ALERT_RATE) || 500;
  if (_kvDedupWriteCount === threshold) {
    logger.warn("[track/click] KV dedup write rate exceeded threshold", {
      metric: "kv_dedup_write_rate_exceeded",
      writes_in_window: _kvDedupWriteCount,
      threshold,
      window_ms: KV_DEDUP_WRITE_WINDOW_MS,
    });
    captureException(new Error(`KV dedup write rate exceeded ${threshold}/min`), {
      context: "[api/track/click] kv-dedup-write-rate",
    });
  }
}

/**
 * Bug 5: dedup key includes product_slug between siteId and contentSlug so
 * clicks on different products are not collapsed together.
 */
async function isDuplicateClick(
  fingerprint: string,
  siteId: string,
  productSlug: string,
  contentSlug: string,
): Promise<"duplicate" | "unique" | "error"> {
  try {
    const kv = getAppCacheKV();
    if (!kv) return "unique";
    const dedupKey = `click-dedup:${safeKeyPart(siteId)}:${safeKeyPart(productSlug)}:${safeKeyPart(contentSlug)}:${fingerprint}`;
    const existing = await kv.get(dedupKey);
    if (existing !== null) return "duplicate";
    await kv.put(dedupKey, "1", { expirationTtl: 86400 });
    // A99-3: Track KV write rate for monitoring/alerting.
    trackKvDedupWrite();
    return "unique";
  } catch {
    // fail-open: best-effort [criticality:non-critical]
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
    const tokenSiteId = payload.site_id;
    if (siteId && tokenSiteId !== siteId) {
      return false;
    }
    return true;
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return false;
  }
}

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
    const overrideUrl = searchParams.get("u") ?? undefined;
    const overrideName = searchParams.get("n") ?? undefined;

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

    // A dial/guide/watch configuration may supply the affiliate URL and display
    // name directly instead of requiring a product row in the database. The URL
    // is validated by the same destination checks below.
    if (overrideUrl) {
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

    // AUDIT-FIX A4-003/A7-006: Slice referrer before parsing to bound memory, strip CR/LF
    // Q2-4: Drop unparsable referrers entirely instead of storing raw strings
    // that could contain URL-encoded HTML. Only well-formed URLs survive.
    let sanitizedReferrer = request.headers.get("referer") || undefined;
    if (sanitizedReferrer) {
      sanitizedReferrer = sanitizedReferrer.replace(/[\r\n\0]/g, "").slice(0, 2048);
      try {
        const refUrl = new URL(sanitizedReferrer);
        sanitizedReferrer = `${refUrl.origin}${refUrl.pathname}`.slice(0, 2048);
      } catch {
        sanitizedReferrer = undefined;
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

    // Append standard affiliate UTM parameters to the redirect when they are
    // not already present, so every tracked link carries attribution data.
    let redirectUrl = destinationUrl;
    try {
      const url = new URL(destinationUrl);
      if (!url.searchParams.has("utm_source")) {
        url.searchParams.set("utm_source", request.headers.get("host") ?? "affiliate-site");
      }
      if (!url.searchParams.has("utm_medium")) {
        url.searchParams.set("utm_medium", "affiliate");
      }
      if (!url.searchParams.has("utm_campaign")) {
        const utmCampaign = rawCampaign || (rawContentSlug !== "content" ? rawContentSlug : "");
        if (utmCampaign) url.searchParams.set("utm_campaign", utmCampaign);
      }
      redirectUrl = url.toString();
    } catch {
      // If the destination is not a valid absolute URL (e.g. a relative path),
      // leave it untouched and let the redirect proceed.
    }

    return NextResponse.redirect(redirectUrl, 302); // nosemgrep
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
