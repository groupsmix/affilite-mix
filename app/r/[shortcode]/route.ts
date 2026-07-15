import { NextRequest, NextResponse } from "next/server";
import { getProductBySlug } from "@/lib/dal/products";
import { pickBestAffiliateLink } from "@/lib/dal/product-affiliate-links";
import { recordClick } from "@/lib/dal/affiliate-clicks";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, rateLimitHeaders } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import { getClientIp } from "@/lib/get-client-ip";
import { runAfterResponse } from "@/lib/wait-until";
import { validateAffiliateDomain } from "@/lib/affiliate-domain-allowlist";
import { logger } from "@/lib/logger";
import { isHttpsUrl } from "@/lib/validation";
import { isPlaceholderAffiliateUrl } from "@/lib/affiliate-url";

/** 60 outbound redirects per minute per IP */
const REDIRECT_RATE_LIMIT = { maxRequests: 60, windowMs: 60 * 1000 };

/**
 * GET /r/[shortcode] — outbound affiliate redirect.
 *
 * `shortcode` is the product slug. The route:
 * 1. Resolves the current site from middleware headers
 * 2. Looks up the product by slug
 * 3. Picks the best affiliate link by geo + weight
 * 4. Logs the click (fire-and-forget)
 * 5. 302 redirects to the affiliate URL
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shortcode: string }> },
) {
  try {
    const ip = getClientIp(request);
    const rl = await checkRateLimit(`redir:${ip}`, REDIRECT_RATE_LIMIT);
    if (!rl.allowed) {
      return apiError(429, "Rate limit exceeded", undefined, {
        "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)),
        ...rateLimitHeaders(REDIRECT_RATE_LIMIT, rl),
      });
    }

    const { shortcode } = await params;
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    const product = await getProductBySlug(siteId, shortcode);
    if (!product) {
      return apiError(404, "Product not found");
    }

    // Detect geo from Cloudflare header (cf-ipcountry) or accept-language
    const geo = request.headers.get("cf-ipcountry") ?? detectGeoFromAcceptLanguage(request);

    // Try smart routing via product_affiliate_links table first
    const bestLink = await pickBestAffiliateLink(product.id, geo);
    const destinationUrl = bestLink?.url ?? product.affiliate_url;

    if (!destinationUrl || isPlaceholderAffiliateUrl(destinationUrl)) {
      return apiError(404, "No affiliate link available for this product");
    }

    // SEC-01: Validate URL scheme before redirecting — prevents javascript:/data:
    // SSRF/XSS vectors if a malicious URL is stored in the database.
    let urlObj: URL;
    try {
      urlObj = new URL(destinationUrl);
      if (!isHttpsUrl(destinationUrl)) {
        logger.error("[r/shortcode] rejected redirect: invalid scheme", {
          siteId,
          shortcode,
          protocol: urlObj.protocol,
        });
        return apiError(400, "Invalid affiliate URL scheme");
      }
    } catch {
      // fail-open: best-effort [criticality:non-critical]
      logger.error("[r/shortcode] rejected redirect: malformed URL", {
        siteId,
        shortcode,
      });
      return apiError(400, "Malformed affiliate URL");
    }

    // SEC-02: Enforce affiliate domain allowlist at redirect time (mirrors
    // the check in /api/track/click). Without this, a compromised DB row
    // could redirect users to a phishing domain.
    //
    // Trust `domainCheck.allowed` directly: validateAffiliateDomain already
    // applies the AFFILIATE_DOMAIN_ENFORCEMENT policy (defaulting to "strict"
    // in production). Re-reading the env var here would diverge from that
    // default and silently allow off-allow-list redirects when the var is
    // unset in production.
    const domainCheck = validateAffiliateDomain(destinationUrl);
    if (!domainCheck.allowed) {
      logger.error("[r/shortcode] rejected affiliate destination off allow-list", {
        siteId,
        shortcode,
        domain: domainCheck.domain,
        reason: domainCheck.reason,
      });
      return apiError(400, "Affiliate destination not on approved domain list");
    }
    if (domainCheck.reason) {
      // `allowed: true` with a `reason` means warn-mode tolerated an
      // off-list domain. Emit a structured warning so the corpus can
      // be audited before AFFILIATE_DOMAIN_ENFORCEMENT=strict ships.
      logger.warn("[r/shortcode] affiliate destination off allow-list (log-only)", {
        siteId,
        shortcode,
        domain: domainCheck.domain,
        reason: domainCheck.reason,
      });
    }

    // Record click (fire-and-forget via waitUntil)
    // Issue 10: validate the `ref` param against the same slug regex used by
    // /api/track/click before storing it, so arbitrary strings (including
    // those with special characters) are never written as content_slug.
    const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/;
    const rawRef = request.nextUrl.searchParams.get("ref") ?? "";
    const contentSlug = SLUG_RE.test(rawRef) ? rawRef : "";
    void runAfterResponse(
      recordClick({
        site_id: siteId,
        product_name: product.name,
        affiliate_url: destinationUrl,
        content_slug: contentSlug,
        referrer: request.headers.get("referer") ?? undefined,
      }),
      { context: "[r/shortcode] recordClick" },
    );

    return NextResponse.redirect(destinationUrl, 302); // nosemgrep
  } catch (err) {
    captureException(err, { context: "[r/shortcode] redirect failed" });
    return apiError(500, "Internal server error");
  }
}

/**
 * Simple geo detection from Accept-Language header as fallback.
 * Returns ISO 3166-1 alpha-2 country code or "*".
 */
function detectGeoFromAcceptLanguage(request: NextRequest): string {
  const acceptLang = request.headers.get("accept-language");
  if (!acceptLang) return "*";

  // Look for locale tags like en-US, de-DE, fr-FR
  const match = acceptLang.match(/[a-z]{2}-([A-Z]{2})/);
  return match ? match[1]! : "*";
}
