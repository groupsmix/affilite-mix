/**
 * Shared click-analytics primitives for the two outbound affiliate paths
 * (`/api/track/click` and `/r/[shortcode]`).
 *
 * Both routes redirect users to a merchant and record one click. Keeping the
 * trust rules in a single module means a click counted on one path is counted
 * under the same conditions on the other: same Sec-Fetch navigation guard,
 * same 24h dedup window, same referrer normalisation and the same
 * admin-session exclusion.
 */

import type { NextRequest } from "next/server";
import { computeHmac } from "@/lib/internal-hmac";
import { getAppCacheKV } from "@/lib/runtime-env";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { verifyToken } from "@/lib/auth";

/**
 * A158: Compute a privacy-preserving click fingerprint for 24-hour dedup.
 * Inputs: HMAC key + site_id + product_slug + content_slug (campaign) + ip_prefix + UA hash.
 * The fingerprint is an HMAC — no raw PII leaves this function.
 */
export async function computeClickFingerprint(
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

/** AUDIT-FIX A2-002: Strip \x1F delimiters from user input to prevent KV key collision. */
export function safeKeyPart(s: string): string {
  return s.replace(/[\x1F\x00]/g, "").slice(0, 160);
}

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
    logger.warn("[click-analytics] KV dedup write rate exceeded threshold", {
      metric: "kv_dedup_write_rate_exceeded",
      writes_in_window: _kvDedupWriteCount,
      threshold,
      window_ms: KV_DEDUP_WRITE_WINDOW_MS,
    });
    captureException(new Error(`KV dedup write rate exceeded ${threshold}/min`), {
      context: "[click-analytics] kv-dedup-write-rate",
    });
  }
}

/**
 * A158: Check KV for a dedup key. Returns "duplicate" if this click is a duplicate
 * within the 24-hour window, "unique" on a cache miss, and "error" on KV failure so
 * callers can fail analytics closed while still redirecting.
 *
 * Bug 5: the dedup key includes product_slug between siteId and contentSlug so
 * clicks on different products are not collapsed together.
 */
export async function isDuplicateClick(
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

/**
 * AUDIT-FIX A4-003/A7-006/Q2-4: Bound the referrer, strip CR/LF/NUL, and keep
 * only `origin + pathname` so query strings (which may carry PII or encoded
 * HTML) are never stored. Unparsable referrers are dropped entirely.
 */
export function sanitizeClickReferrer(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[\r\n\0]/g, "").slice(0, 2048);
  try {
    const refUrl = new URL(cleaned);
    return `${refUrl.origin}${refUrl.pathname}`.slice(0, 2048);
  } catch {
    // fail-open: best-effort [criticality:non-critical]
    return undefined;
  }
}

/**
 * AUDIT-FIX A3-002: GET requests may be triggered cross-site (image tags,
 * prefetch, embed, etc.) without user activation. Only top-level trusted
 * navigations ("none", "same-origin", "same-site") may record analytics.
 * Missing Sec-Fetch-Site means the browser did not send the header at all
 * (e.g. prefetch pipelines, crawlers) — treat as untrusted.
 */
export function shouldSkipClickAnalytics(request: NextRequest): boolean {
  const secFetchSite = request.headers.get("sec-fetch-site");
  const secFetchDest = request.headers.get("sec-fetch-dest");
  const trustedNavigation =
    secFetchSite === "none" || secFetchSite === "same-origin" || secFetchSite === "same-site";
  // Skip analytics for any non-document sub-resource request even if it
  // somehow arrives with a trusted site value.
  return !trustedNavigation || (secFetchDest !== null && secFetchDest !== "document");
}

/**
 * AUDIT-FIX A3-006/A6-003: Validate admin session AND bind to the resolved siteId
 * so an admin from tenant A cannot suppress analytics on tenant B's clicks.
 */
export async function hasValidAdminSession(
  request: NextRequest,
  siteId?: string,
): Promise<boolean> {
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
