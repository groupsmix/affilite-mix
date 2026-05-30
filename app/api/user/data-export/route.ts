import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { captureException } from "@/lib/sentry";
import { getTenantClient } from "@/lib/supabase-server";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { logger } from "@/lib/logger";
import { isValidEmail, sanitizeEmailInput } from "@/lib/validate-email";
import crypto from "node:crypto";

/**
 * S3-004 + A62-F1: GDPR Art. 20 — self-service data portability endpoint.
 *
 * Two-step flow to prevent enumeration:
 *   1. POST /api/user/data-export  { email }  → returns a time-limited HMAC token
 *   2. GET  /api/user/data-export?email=<email>&token=<token>  → returns data
 *
 * The token is HMAC-SHA256(email|site_id|timestamp) using CRON_SECRET as key,
 * valid for 15 minutes. This proves the requester controlled the POST and
 * received the token (e.g. via the UI response or a verification email).
 */

const RATE_LIMIT_CONFIG = {
  maxRequests: 3,
  windowMs: 15 * 60 * 1000,
  failPolicy: "closed" as const,
};

const TOKEN_VALIDITY_MS = 15 * 60 * 1000; // 15 minutes

function getHmacKey(): string {
  return process.env.CRON_SECRET ?? process.env.INTERNAL_API_TOKEN ?? "";
}

function generateExportToken(email: string, siteId: string): string {
  const key = getHmacKey();
  if (!key) return "";
  const ts = Date.now().toString(36);
  const payload = `${email}|${siteId}|${ts}`;
  const sig = crypto.createHmac("sha256", key).update(payload).digest("hex");
  return `${ts}.${sig}`;
}

function verifyExportToken(email: string, siteId: string, token: string): boolean {
  const key = getHmacKey();
  if (!key || !token) return false;
  const dotIdx = token.indexOf(".");
  if (dotIdx < 1) return false;
  const ts = token.slice(0, dotIdx);
  const sig = token.slice(dotIdx + 1);
  const timestamp = Number.parseInt(ts, 36);
  if (!Number.isFinite(timestamp)) return false;
  if (Date.now() - timestamp > TOKEN_VALIDITY_MS) return false;
  const payload = `${email}|${siteId}|${ts}`;
  const expected = crypto.createHmac("sha256", key).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

/**
 * POST /api/user/data-export — Request an export token.
 * Returns a time-limited HMAC token that must be passed to the GET endpoint.
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`data-export:${ip}`, RATE_LIMIT_CONFIG);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const rawEmail = typeof body.email === "string" ? body.email : "";
  const email = sanitizeEmailInput(rawEmail).trim().toLowerCase();
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

  const token = generateExportToken(email, dbSiteId);
  if (!token) {
    logger.error("[data-export] HMAC key not configured — cannot generate export token");
    return NextResponse.json({ error: "Export temporarily unavailable." }, { status: 503 });
  }

  logger.info("Data export token generated", { email_len: email.length, site_id: dbSiteId });

  return NextResponse.json({
    ok: true,
    token,
    message: "Use this token with the GET endpoint within 15 minutes to download your data.",
  });
}

/**
 * GET /api/user/data-export?email=<email>&token=<token>
 * A62-F1: Now requires a valid HMAC token from the POST step.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`data-export:${ip}`, RATE_LIMIT_CONFIG);
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

  const token = request.nextUrl.searchParams.get("token") ?? "";

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

  if (!verifyExportToken(email, dbSiteId, token)) {
    return NextResponse.json(
      { error: "Invalid or expired export token. Please request a new one via POST." },
      { status: 403 },
    );
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
