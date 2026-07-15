import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { getCurrentSite, getSiteIdFromHeader } from "@/lib/site-context";
import { hasSiteFeature } from "@/lib/site-features";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { createComment, listApprovedComments } from "@/lib/dal/community";
import { getClientIp } from "@/lib/get-client-ip";
import { verifyTurnstile } from "@/lib/turnstile";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { normalizeEmail, hashEmailForRateLimit } from "@/lib/validate-email";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { isUsableUuid } from "@/lib/security/uuid";

/**
 * GET /api/community/comments?target_type=product&target_id=xxx
 * List approved comments for a target.
 *
 * audit5-#2: prior revisions had no rate limit and no UUID validation on
 * the GET, so an attacker could (a) exhaust the Supabase connection pool
 * with unbounded reads and (b) trigger 500 spam by passing malformed
 * `target_id` values which Postgres rejects with a syntax error. We now
 * rate-limit at 120 req/min per IP (`failPolicy: "open"` because this
 * is a read-only public endpoint and we prefer availability over a
 * blanket lockout during a KV outage), and reject non-UUID `target_id`s
 * with a 400 before they reach the DB.
 */
export async function GET(request: NextRequest) {
  const site = await getCurrentSite();
  if (!hasSiteFeature(site, "community")) {
    return apiError(404, "Not found", undefined, undefined, "NOT_FOUND");
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`comments-get:${ip}`, {
    maxRequests: 120,
    windowMs: 60_000,
    failPolicy: "open" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  const url = new URL(request.url);
  const targetType = url.searchParams.get("target_type") as "product" | "content" | null;
  const targetId = url.searchParams.get("target_id");

  if (
    !targetType ||
    !targetId ||
    !["product", "content"].includes(targetType) ||
    !isUsableUuid(targetId)
  ) {
    return NextResponse.json({ error: "target_type and target_id are required" }, { status: 400 });
  }

  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1),
    100,
  );
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10) || 0, 0);

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);
    const comments = await listApprovedComments(siteId, targetType, targetId, { limit, offset });
    return NextResponse.json({ comments, pagination: { limit, offset } });
  } catch (err) {
    // audit5-#10: this was previously `// fail-open: best-effort` with
    // no log or Sentry breadcrumb. A 500 to the user with zero
    // observability hides real incidents (DB pool exhaustion, slow
    // query, schema drift). Now: emit the structured log line and
    // forward to Sentry; surface the error class to the user only as
    // a generic message so we don't leak internals.
    logger.error("community.comments.list_failed", {
      target_type: targetType,
      target_id: targetId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { context: "api/community/comments.GET" });
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

/**
 * POST /api/community/comments
 * Submit a comment (goes to moderation queue).
 * Body: { target_type, target_id, parent_id?, user_email, user_name, body, turnstileToken }
 */
export async function POST(request: NextRequest) {
  const site = await getCurrentSite();
  if (!hasSiteFeature(site, "community")) {
    return apiError(404, "Not found", undefined, undefined, "NOT_FOUND");
  }

  const ip = getClientIp(request);

  // Rate limit: 10 comments per hour per IP
  // SEC-04: failPolicy "closed" prevents comment spam during KV outages.
  const rl = await checkRateLimit(`comment:${ip}`, {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000,
    failPolicy: "closed" as const,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many comments. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: {
    target_type?: string;
    target_id?: string;
    parent_id?: string;
    user_email?: string;
    user_name?: string;
    body?: string;
    turnstileToken?: string;
  };
  const parsed = await parseJsonBody(request);
  if (parsed instanceof NextResponse) return parsed;
  body = parsed as typeof body;

  if (!body.target_type || !body.target_id || !body.user_email || !body.user_name || !body.body) {
    return NextResponse.json(
      { error: "target_type, target_id, user_email, user_name, and body are required" },
      { status: 400 },
    );
  }

  // Validate email format.
  // SECURITY: bound length before regex to prevent polynomial-ReDoS via
  // long crafted inputs (the `[^\s@]+...[^\s@]+` shape can backtrack
  // quadratically). 254 is the RFC 5321 SMTP path length cap.
  if (typeof body.user_email !== "string" || body.user_email.length > 254) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.user_email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // V4-01: user_name comes from untrusted JSON; the required-field check above
  // only tests truthiness, so a non-string (e.g. a number) would throw on the
  // String methods below and surface as a 500. Guard the type for a clean 400.
  if (typeof body.user_name !== "string") {
    return NextResponse.json({ error: "user_name must be a string" }, { status: 400 });
  }

  // V4-01: Normalize user_name to NFC and strip bidi-control / invisible chars
  // (including bidi isolates U+2066-U+2069 and the Arabic Letter Mark U+061C,
  // matching lib/safe-redirect.ts) to prevent homoglyph spoofing and
  // RTL-override display tricks.
  body.user_name = body.user_name
    .normalize("NFC")
    .replace(/[\u00AD\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, "");

  // Validate user_name length (after normalization)
  if (body.user_name.length > 80) {
    return NextResponse.json({ error: "user_name must be 80 characters or less" }, { status: 400 });
  }

  // Validate body length
  if (body.body.length > 2000) {
    return NextResponse.json({ error: "body must be 2000 characters or less" }, { status: 400 });
  }

  if (!["product", "content"].includes(body.target_type)) {
    return NextResponse.json(
      { error: "target_type must be 'product' or 'content'" },
      { status: 400 },
    );
  }

  // SEC-07: Validate target_id and parent_id are UUIDs to prevent injection.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(body.target_id)) {
    return NextResponse.json({ error: "target_id must be a valid UUID" }, { status: 400 });
  }
  if (body.parent_id && !UUID_RE.test(body.parent_id)) {
    return NextResponse.json({ error: "parent_id must be a valid UUID" }, { status: 400 });
  }

  // Verify Turnstile CAPTCHA
  const turnstileResult = await verifyTurnstile(body.turnstileToken, ip);
  if (!turnstileResult.success) {
    return NextResponse.json(
      { error: turnstileResult.error || "Captcha verification failed" },
      { status: 403 },
    );
  }

  // Normalize email (trim + lowercase) so rate limits and storage are case-insensitive.
  const normalizedEmail = normalizeEmail(body.user_email);
  // F-007: Hash email before using in rate-limit key to avoid PII in operational metadata
  const rateLimitEmail = await hashEmailForRateLimit(normalizedEmail);

  // Per-email rate limit: 5 comments per hour per email
  const emailRl = await checkRateLimit(`comment-email:${rateLimitEmail}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
  });
  if (!emailRl.allowed) {
    return NextResponse.json(
      { error: "Too many comments from this email. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(emailRl.retryAfterMs / 1000)) } },
    );
  }

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    // Sanitize HTML in body before storing
    let sanitizedBody: string;
    try {
      sanitizedBody = sanitizeHtml(body.body);
    } catch (err) {
      // C8-02: Match on the actual sanitizeHtml error message
      if (err instanceof Error && err.message.includes("maximum allowed length")) {
        return NextResponse.json({ error: "Comment is too large" }, { status: 400 });
      }
      throw err;
    }

    // S0-V4-004: re-check body length after sanitization — the sanitizer
    // may strip tags (reducing length) but the stored value should still
    // respect the 2000-char business limit.
    if (sanitizedBody.length > 2000) {
      return NextResponse.json({ error: "body must be 2000 characters or less" }, { status: 400 });
    }

    // SEC-06: Sanitize user_name to strip any HTML/script injection.
    // Use the same tag-stripping path as `body` (sanitizeHtml) instead of
    // HTML-entity encoding — React auto-escapes text content on render, so
    // entity-encoding here would double-encode common characters (`'` →
    // `&#39;` would render as the literal string `&#39;` in `O'Brien`).
    const sanitizedName = sanitizeHtml(body.user_name).trim();

    const comment = await createComment({
      site_id: siteId,
      target_type: body.target_type as "product" | "content",
      target_id: body.target_id,
      parent_id: body.parent_id,
      user_email: normalizedEmail,
      user_name: sanitizedName,
      body: sanitizedBody,
    });

    return NextResponse.json({ message: "Comment submitted for review", comment }, { status: 201 });
  } catch (err) {
    // audit5-#10: previously silenced as `// fail-open: best-effort`.
    // Restore observability for the create-comment failure path.
    logger.error("community.comments.create_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { context: "api/community/comments.POST" });
    return NextResponse.json({ error: "Failed to submit comment" }, { status: 500 });
  }
}
