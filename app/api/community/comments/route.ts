import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { createComment, listApprovedComments } from "@/lib/dal/community";
import { getClientIp } from "@/lib/get-client-ip";
import { verifyTurnstile } from "@/lib/turnstile";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { normalizeEmail } from "@/lib/validate-email";

/**
 * GET /api/community/comments?target_type=product&target_id=xxx
 * List approved comments for a target.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const targetType = url.searchParams.get("target_type") as "product" | "content" | null;
  const targetId = url.searchParams.get("target_id");

  if (!targetType || !targetId || !["product", "content"].includes(targetType)) {
    return NextResponse.json({ error: "target_type and target_id are required" }, { status: 400 });
  }

  try {
    const comments = await listApprovedComments(targetType, targetId);
    return NextResponse.json({ comments });
  } catch {
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
}

/**
 * POST /api/community/comments
 * Submit a comment (goes to moderation queue).
 * Body: { target_type, target_id, parent_id?, user_email, user_name, body, turnstileToken }
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Rate limit: 10 comments per hour per IP
  const rl = await checkRateLimit(`comment:${ip}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 });
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
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.target_type || !body.target_id || !body.user_email || !body.user_name || !body.body) {
    return NextResponse.json(
      { error: "target_type, target_id, user_email, user_name, and body are required" },
      { status: 400 },
    );
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.user_email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // Validate user_name length
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
  const { getRateLimitEmailKey } = await import("@/lib/validate-email");
  const rateLimitEmail = getRateLimitEmailKey(normalizedEmail);

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
      if (err instanceof Error && err.message.includes("100KB")) {
        return NextResponse.json({ error: "Comment is too large" }, { status: 400 });
      }
      throw err;
    }

    const comment = await createComment({
      site_id: siteId,
      target_type: body.target_type as "product" | "content",
      target_id: body.target_id,
      parent_id: body.parent_id,
      user_email: normalizedEmail,
      user_name: body.user_name,
      body: sanitizedBody,
    });

    return NextResponse.json({ message: "Comment submitted for review", comment }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to submit comment" }, { status: 500 });
  }
}
