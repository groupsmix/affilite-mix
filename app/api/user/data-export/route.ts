import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { captureException } from "@/lib/sentry";
import { getTenantClient } from "@/lib/supabase-server";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { logger } from "@/lib/logger";
import { isValidEmail, sanitizeEmailInput, hashEmailForRateLimit } from "@/lib/validate-email";
import { getAppCacheKV } from "@/lib/runtime-env";
// A47-02: Turnstile CAPTCHA on GET to prevent automated email enumeration
import { verifyTurnstile } from "@/lib/turnstile";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { getCurrentSite } from "@/lib/site-context";
// L1-FIX: constant-time compare for the verification code to remove timing leak
import { timingSafeEqual } from "@/lib/internal-hmac";

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
  // L2-FIX: Use rejection sampling to eliminate modulo bias.
  // 2^32 % 10^6 = 967296, so codes 000000–967295 are ~0.023% more likely
  // than 967296–999999 with naive modulo. Rejection sampling discards
  // values in the biased tail [floor(2^32/10^6)*10^6, 2^32) and retries.
  const MAX = 10 ** CODE_LENGTH; // 1_000_000
  const LIMIT = Math.floor(0x100000000 / MAX) * MAX; // 4_294_000_000
  const bytes = new Uint8Array(4);
  let num: number;
  do {
    crypto.getRandomValues(bytes);
    num = ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0;
  } while (num >= LIMIT);
  return String(num % MAX).padStart(CODE_LENGTH, "0");
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

  // H3-FIX: Add per-email rate limit to prevent IP-rotation brute-force.
  // The existing IP rate limit (3 req / 15 min) is bypassable via residential proxies.
  // A 6-digit code has 10^6 possibilities; with only IP-based limits an attacker
  // can guess it in ~100 min with ~3000 rotating IPs. Per-email limit plugs this gap.
  const emailRl = await checkRateLimit(`data-export-email:${emailHash}:${dbSiteId}`, {
    maxRequests: 3,
    windowMs: 60 * 60 * 1000, // 3 requests per hour per email+site
    failPolicy: "closed" as const,
  });
  if (!emailRl.allowed) {
    // Return 200 to prevent email enumeration (same as normal success path)
    logger.warn("Data export rate limit hit for email hash", {
      email_hash: emailHash,
      site_id: dbSiteId,
    });
    return NextResponse.json({
      message:
        "If this email has data on this site, a verification code has been sent. " +
        "Use it with GET /api/user/data-export?email=...&code=... within 10 minutes.",
    });
  }

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

  // FIX: Actually send the verification code via Resend.
  // The previous implementation stored the code in KV but never emailed it,
  // making the entire data-export feature non-functional.
  const resendKey = process.env.RESEND_API_KEY;
  const isProd = process.env.NODE_ENV === "production";

  if (resendKey) {
    try {
      let site: { name: string; domain: string } = { name: "Our Site", domain: "example.com" };
      try {
        const s = await getCurrentSite();
        site = { name: s.name, domain: s.domain };
      } catch {
        // fail-open: use defaults if site context unavailable
      }
      const safeSiteName = site.name.replace(/[\r\n\0]/g, " ").slice(0, 120);
      const safeDomain = site.domain.replace(/[\r\n\0]/g, "").toLowerCase();
      const fromEmail = `noreply@${safeDomain}`;

      const emailHtml = `
        <p>You requested a copy of your data from ${safeSiteName}.</p>
        <p>Your verification code is: <strong>${code}</strong></p>
        <p>This code expires in 10 minutes. Use it at:<br>
        <code>GET /api/user/data-export?email=${encodeURIComponent(email)}&code=${code}</code></p>
        <p>If you did not request this, you can ignore this email.</p>
      `;
      const emailText = `Your data export verification code for ${safeSiteName}: ${code}\n\nThis code expires in 10 minutes.\n\nIf you did not request this, ignore this email.`;

      const res = await fetchWithTimeout("https://api.resend.com/emails", {
        method: "POST",
        timeoutMs: 10_000,
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `Your data export verification code — ${safeSiteName}`,
          html: emailHtml,
          text: emailText,
        }),
      });

      if (!res.ok) {
        await res.text().catch(() => "");
        captureException(new Error(`Resend returned ${res.status} for data-export code`), {
          context: "[api/user/data-export] email send failed",
        });
        if (isProd) {
          return NextResponse.json(
            { error: "Could not send verification email. Please try again later." },
            { status: 503, headers: { "Retry-After": "30" } },
          );
        }
      }
    } catch (emailErr) {
      captureException(emailErr, { context: "[api/user/data-export] email send threw" });
      if (isProd) {
        return NextResponse.json(
          { error: "Could not send verification email. Please try again later." },
          { status: 503, headers: { "Retry-After": "30" } },
        );
      }
    }
  } else if (isProd) {
    logger.error("[data-export] RESEND_API_KEY missing in production — cannot send code");
    return NextResponse.json(
      { error: "Data export is temporarily unavailable. Please try again later." },
      { status: 503 },
    );
  }

  logger.info("Data export verification code sent", {
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

  // A47-02: Require Turnstile CAPTCHA to prevent automated email enumeration.
  const turnstileToken = request.nextUrl.searchParams.get("turnstile_token");
  if (!turnstileToken) {
    return NextResponse.json(
      { error: "turnstile_token parameter is required for bot protection." },
      { status: 400 },
    );
  }
  const turnstileResult = await verifyTurnstile(turnstileToken, ip);
  if (!turnstileResult.success) {
    return NextResponse.json(
      { error: "CAPTCHA verification failed. Please try again." },
      { status: 403 },
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

  if (!storedCode || !timingSafeEqual(storedCode, code)) {
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
