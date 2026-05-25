import { NextRequest, NextResponse } from "next/server";
import { getTenantClient } from "@/lib/supabase-server";
import { resolveDbSiteBySlug } from "@/lib/dal/site-resolver";
import { getClientIp } from "@/lib/get-client-ip";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { captureException } from "@/lib/sentry";
import crypto from "crypto";

/**
 * A100-10: In-memory rate limiter for consent log endpoint.
 * Limits to 5 requests per IP per 60 seconds to prevent bot flooding
 * of the consent_log table. Uses a simple sliding-window approach.
 */
const CONSENT_RATE_LIMIT = 5;
const CONSENT_RATE_WINDOW_MS = 60_000;
const consentRateLimitMap = new Map<string, number[]>();

// Periodic cleanup to prevent unbounded memory growth
let lastCleanup = Date.now();
function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < CONSENT_RATE_WINDOW_MS) return;
  lastCleanup = now;
  const cutoff = now - CONSENT_RATE_WINDOW_MS;
  for (const [key, timestamps] of consentRateLimitMap) {
    const valid = timestamps.filter((t) => t > cutoff);
    if (valid.length === 0) {
      consentRateLimitMap.delete(key);
    } else {
      consentRateLimitMap.set(key, valid);
    }
  }
  // Hard cap: prevent unbounded growth even under distributed attack
  if (consentRateLimitMap.size > 10_000) {
    consentRateLimitMap.clear();
  }
}

function isConsentRateLimited(ip: string): boolean {
  cleanupRateLimitMap();
  const now = Date.now();
  const cutoff = now - CONSENT_RATE_WINDOW_MS;
  const timestamps = consentRateLimitMap.get(ip) ?? [];
  const valid = timestamps.filter((t) => t > cutoff);
  if (valid.length >= CONSENT_RATE_LIMIT) {
    return true;
  }
  valid.push(now);
  consentRateLimitMap.set(ip, valid);
  return false;
}

/**
 * A98-62: Valid IAB TCF / GPP consent categories.
 * Rejects unknown categories to prevent malformed consent payloads
 * from polluting the consent_log table.
 */
const VALID_CONSENT_CATEGORIES = new Set([
  "necessary",
  "functional",
  "analytics",
  "advertising",
  "personalization",
  "security",
  "performance",
]);

/** A98-62: Maximum number of categories per consent payload. */
const MAX_CATEGORIES = 10;
/** A98-62: Maximum banner_version length. */
const MAX_BANNER_VERSION_LENGTH = 64;

/**
 * A98-62: Validate consent categories are known and well-formed.
 * Returns null if valid, or an error message string if invalid.
 */
function validateConsentCategories(categories: unknown): string | null {
  if (!Array.isArray(categories)) return "categories must be an array";
  if (categories.length === 0) return "categories cannot be empty";
  if (categories.length > MAX_CATEGORIES) return `categories exceeds maximum of ${MAX_CATEGORIES}`;

  for (const cat of categories) {
    if (typeof cat !== "string") return "each category must be a string";
    if (!VALID_CONSENT_CATEGORIES.has(cat.toLowerCase())) {
      return `unknown consent category: ${cat}`;
    }
  }
  return null;
}

/**
 * POST /api/consent/log
 * OF-04: Server-side consent proof logging.
 * Records every CMP consent decision so we can prove lawful basis at audit time.
 */
export async function POST(request: NextRequest) {
  // A100-10: Rate limit consent log to prevent bot flooding.
  const clientIp = getClientIp(request) ?? "unknown";
  if (isConsentRateLimited(clientIp)) {
    return apiError(429, "Too many consent log requests");
  }

  const bodyOrError = await parseJsonBody(request);
  if (bodyOrError instanceof NextResponse) return bodyOrError;

  const { site_id, categories, banner_version, gpc, subject_id } = bodyOrError as {
    site_id?: string;
    categories?: string[];
    banner_version?: string;
    gpc?: boolean;
    subject_id?: string;
  };

  if (!site_id || !categories || !banner_version) {
    return apiError(400, "site_id, categories, and banner_version are required");
  }

  // A98-62: Strict category validation before persistence.
  const categoryError = validateConsentCategories(categories);
  if (categoryError) {
    return apiError(400, `Invalid consent categories: ${categoryError}`);
  }

  // A98-62: Validate banner_version is a non-empty string within length limits.
  if (
    typeof banner_version !== "string" ||
    banner_version.trim().length === 0 ||
    banner_version.length > MAX_BANNER_VERSION_LENGTH
  ) {
    return apiError(
      400,
      `banner_version must be a non-empty string with max ${MAX_BANNER_VERSION_LENGTH} chars`,
    );
  }

  // OF-04: accept either a UUID or a site slug from the CMP. Resolving server-
  // side avoids leaking the UUID to the client and tolerates older banner
  // builds that still post the slug.
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let resolvedSiteId = site_id;
  if (!uuidRegex.test(site_id)) {
    const row = await resolveDbSiteBySlug(site_id);
    if (!row) {
      return apiError(400, "Unknown site");
    }
    resolvedSiteId = row.id;
  }

  const ip = getClientIp(request);
  const ipTruncated = ip ? ip.split(".").slice(0, 3).join(".") + ".0" : "unknown";
  const ua = request.headers.get("user-agent") ?? "";
  const uaHash = crypto.createHash("sha256").update(ua).digest("hex").substring(0, 16);

  try {
    const sb = await getTenantClient();
    // eslint-disable-next-line no-restricted-syntax -- public insert; no RLS bypass needed
    const { error } = await sb.from("consent_log").insert({
      site_id: resolvedSiteId,
      subject_id: subject_id ?? null,
      // A98-62: Store categories as lowercase for consistent querying
      categories: categories.map((c) => c.toLowerCase()),
      banner_version: banner_version.trim(),
      gpc: gpc ?? false,
      ua_hash: uaHash,
      ip_truncated: ipTruncated,
    });

    if (error) {
      captureException(error, { context: "[api/consent/log] insert failed" });
      return apiError(500, "Failed to log consent");
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    captureException(err, { context: "[api/consent/log] unexpected error" });
    return apiError(500, "Internal server error");
  }
}
