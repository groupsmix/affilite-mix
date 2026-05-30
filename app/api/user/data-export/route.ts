import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { captureException } from "@/lib/sentry";
import { getTenantClient } from "@/lib/supabase-server";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { logger } from "@/lib/logger";
import { isValidEmail, sanitizeEmailInput } from "@/lib/validate-email";
import { verifyTurnstile } from "@/lib/turnstile";

/**
 * S3-004: GDPR Art. 20 — self-service data portability endpoint.
 *
 * GET /api/user/data-export?email=<email>
 *
 * Returns all personal data associated with the email on the current
 * site as a JSON download. No admin session required — any visitor can
 * request their own data (rate-limited to prevent abuse).
 */

const RATE_LIMIT_CONFIG = {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
  failPolicy: "closed" as const,
};

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`data-export:${ip}`, RATE_LIMIT_CONFIG);
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

    logger.info("Self-service data export", { email_hash: email.length, site_id: dbSiteId });

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
