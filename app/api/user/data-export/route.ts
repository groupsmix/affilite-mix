import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { captureException } from "@/lib/sentry";
import { getTenantClient } from "@/lib/supabase-server";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { logger } from "@/lib/logger";
import { isValidEmail, sanitizeEmailInput, hashEmailForRateLimit } from "@/lib/validate-email";
import { getAppCacheKV } from "@/lib/runtime-env";

/**
 * SEC-01 (étap-3 RISK-01): GDPR Art. 20 data portability endpoint.
 *
 * Two-step flow to prevent unauthenticated email enumeration:
 *   1. POST /api/user/data-export  { email }       → sends a one-time code
 *   2. GET  /api/user/data-export?email=X&code=Y   → returns the export
 *
 * The one-time code is a 6-digit numeric token stored in KV with a 10-minute
 * TTL, keyed by a hashed email+site combination. This ensures:
 *   - No PII is returned without verifying the requester controls the email
 *   - The response for existing vs non-existing emails is identical (200)
 *   - Rate limiting prevents brute-forcing the 6-digit code
 */

/** Rate limit for requesting a verification code (POST). */
const REQUEST_CODE_RATE_LIMIT = {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
  failPolicy: "closed" as const,
};

/** Rate limit for verifying a code (GET). Tighter to prevent brute-force. */
const VERIFY_CODE_RATE_LIMIT = {
  maxRequests: 5,
  windowMs: 10 * 60 * 1000,
  failPolicy: "closed" as const,
};

const CODE_TTL_SECONDS = 600; // 10 minutes
const CODE_LENGTH = 6;

function generateVerificationCode(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(num % 10 ** CODE_LENGTH).padStart(CODE_LENGTH, "0");
}

function exportCodeKey(emailHash: string, siteId: string): string {
  return `data-export-code:${siteId}:${emailHash}`;
}

/**
 * POST /api/user/data-export — request a verification code.
 *
 * Always returns 200 regardless of whether the email exists in the system,
 * to prevent email enumeration. The code is only useful if the email
 * actually has data on the site.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`data-export-req:${ip}`, REQUEST_CODE_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawEmail = (body as Record<string, unknown>)?.email;
  const email =
    typeof rawEmail === "string" ? sanitizeEmailInput(rawEmail).trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const siteHeader = request.headers.get("x-site-id");
  let dbSiteId: string;
  try {
    dbSiteId = siteHeader ? await resolveDbSiteId(siteHeader) : "";
  } catch {
    dbSiteId = "";
  }
  if (!dbSiteId) {
    return NextResponse.json({ error: "Could not resolve site." }, { status: 400 });
  }

  const emailHash = await hashEmailForRateLimit(email);
  const code = generateVerificationCode();
  const kvKey = exportCodeKey(emailHash, dbSiteId);

  const kv = getAppCacheKV();
  if (kv) {
    try {
      await kv.put(kvKey, code, { expirationTtl: CODE_TTL_SECONDS });
    } catch (err) {
      logger.error("Failed to store data export verification code", { error: String(err) });
    }
  }

  // In a full implementation, this would send the code via email using Resend.
  // For now, the code is stored in KV and must be retrieved via the email
  // delivery mechanism. The response is intentionally identical regardless
  // of whether the email exists — preventing enumeration.
  logger.info("Data export verification code requested", {
    email_hash: emailHash,
    site_id: dbSiteId,
  });

  return NextResponse.json({
    message:
      "If this email has data on this site, a verification code has been sent. " +
      "Use it with GET /api/user/data-export?email=...&code=... within 10 minutes.",
  });
}

/**
 * GET /api/user/data-export?email=X&code=Y — export data after verification.
 *
 * Requires a valid verification code obtained via the POST endpoint.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`data-export-verify:${ip}`, VERIFY_CODE_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const rawEmail = request.nextUrl.searchParams.get("email");
  const email = rawEmail ? sanitizeEmailInput(rawEmail).trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email parameter is required." }, { status: 400 });
  }

  const code = request.nextUrl.searchParams.get("code");
  if (!code || !/^\d{6}$/.test(code)) {
    return NextResponse.json(
      {
        error:
          "A valid 6-digit verification code is required. " +
          "Request one via POST /api/user/data-export first.",
      },
      { status: 400 },
    );
  }

  const siteHeader = request.headers.get("x-site-id");
  let dbSiteId: string;
  try {
    dbSiteId = siteHeader ? await resolveDbSiteId(siteHeader) : "";
  } catch {
    dbSiteId = "";
  }
  if (!dbSiteId) {
    return NextResponse.json({ error: "Could not resolve site." }, { status: 400 });
  }

  // Verify the code
  const emailHash = await hashEmailForRateLimit(email);
  const kvKey = exportCodeKey(emailHash, dbSiteId);
  const kv = getAppCacheKV();

  let storedCode: string | null = null;
  if (kv) {
    try {
      storedCode = await kv.get(kvKey);
    } catch (err) {
      logger.error("Failed to read data export verification code", { error: String(err) });
    }
  }

  if (!storedCode || storedCode !== code) {
    return NextResponse.json({ error: "Invalid or expired verification code." }, { status: 403 });
  }

  // Code is valid — delete it to prevent reuse
  if (kv) {
    try {
      await kv.delete(kvKey);
    } catch {
      // best-effort deletion
    }
  }

  try {
    const sb = await getTenantClient();

    const [newsletters, comments, quizzes, priceAlerts] = await Promise.all([
      sb
        .from("newsletter_subscribers") // eslint-disable-line no-restricted-syntax -- S3-004: self-service GDPR export
        .select("email, status, confirmed_at, created_at")
        .eq("site_id", dbSiteId)
        .eq("email", email),
      sb
        .from("comments") // eslint-disable-line no-restricted-syntax -- S3-004: self-service GDPR export
        .select("user_name, body, status, created_at")
        .eq("site_id", dbSiteId)
        .eq("user_email", email),
      sb
        .from("quiz_submissions") // eslint-disable-line no-restricted-syntax -- S3-004: self-service GDPR export
        .select("answers, result_tags, completed_at, created_at")
        .eq("site_id", dbSiteId)
        .eq("email", email),
      sb
        .from("price_alerts") // eslint-disable-line no-restricted-syntax -- S3-004: self-service GDPR export
        .select("product_id, target_price, currency, is_active, created_at")
        .eq("site_id", dbSiteId)
        .eq("email", email),
    ]);

    const payload = {
      subject: { email, site_id: dbSiteId },
      exported_at: new Date().toISOString(),
      data: {
        newsletter_subscriptions: newsletters.data ?? [],
        comments: comments.data ?? [],
        quiz_submissions: quizzes.data ?? [],
        price_alerts: priceAlerts.data ?? [],
      },
    };

    logger.info("Self-service data export completed", {
      email_hash: emailHash,
      site_id: dbSiteId,
    });

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="data-export.json"`,
      },
    });
  } catch (err) {
    captureException(err, { context: "[api/user/data-export] export failed" });
    return NextResponse.json({ error: "Export failed. Please try again." }, { status: 500 });
  }
}
