import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { createWristShot, listApprovedWristShots } from "@/lib/dal/community";
import { getClientIp } from "@/lib/get-client-ip";
import { verifyTurnstile } from "@/lib/turnstile";
import { isValidEmail } from "@/lib/validate-email";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { captureException } from "@/lib/sentry";

/**
 * GET /api/community/wrist-shots?product_id=xxx
 * List approved wrist shots for a product.
 */
export async function GET(request: NextRequest) {
  const productId = new URL(request.url).searchParams.get("product_id");
  if (!productId) {
    return NextResponse.json({ error: "product_id is required" }, { status: 400 });
  }

  try {
    const shots = await listApprovedWristShots(productId);
    return NextResponse.json({ wrist_shots: shots });
  } catch {
    return NextResponse.json({ error: "Failed to load wrist shots" }, { status: 500 });
  }
}

/**
 * POST /api/community/wrist-shots
 * Submit a wrist shot (goes to moderation queue).
 * F-003: Hardened with Turnstile, email validation, R2-only image URLs, caption sanitization.
 * Body: { product_id?: string, user_email: string, user_name: string, image_url: string, caption?: string, turnstileToken: string }
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // F-003: Stricter rate limit - 1 per hour per IP (was 5 per hour)
  const rl = await checkRateLimit(`wrist-shot:${ip}`, { maxRequests: 1, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Try again later." },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }

  let body: {
    product_id?: string;
    user_email?: string;
    user_name?: string;
    image_url?: string;
    caption?: string;
    turnstileToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // F-003: Require Turnstile token
  if (!body.turnstileToken) {
    return NextResponse.json({ error: "Turnstile token is required" }, { status: 400 });
  }

  // F-003: Verify Turnstile
  const turnstile = await verifyTurnstile(body.turnstileToken, ip);
  if (!turnstile.success) {
    return NextResponse.json(
      { error: turnstile.error ?? "Captcha verification failed" },
      { status: 403 },
    );
  }

  if (!body.user_email || !body.user_name || !body.image_url) {
    return NextResponse.json(
      { error: "user_email, user_name, and image_url are required" },
      { status: 400 },
    );
  }

  // F-003: Validate email format
  if (!isValidEmail(body.user_email)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // F-003: Validate image_url points to our R2 public bucket (no external URLs)
  const r2PublicUrl = process.env.R2_PUBLIC_URL;
  if (!r2PublicUrl) {
    captureException(new Error("R2_PUBLIC_URL not configured"), {
      context: "[wrist-shots] F-003 R2 check",
    });
    return NextResponse.json({ error: "Upload service not configured" }, { status: 503 });
  }

  try {
    const imageUrl = new URL(body.image_url);
    const allowedHost = new URL(r2PublicUrl).hostname;

    if (imageUrl.hostname !== allowedHost) {
      captureException(new Error("Invalid image_url host"), {
        context: "[wrist-shots] F-003 R2 enforcement",
        extra: { host: imageUrl.hostname, allowed: allowedHost },
      });
      return NextResponse.json(
        { error: "image_url must point to the platform CDN" },
        { status: 400 },
      );
    }

    // Ensure it's an HTTPS URL
    if (imageUrl.protocol !== "https:") {
      return NextResponse.json({ error: "image_url must use HTTPS" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid image_url" }, { status: 400 });
  }

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    // F-003: Sanitize caption to prevent XSS
    const sanitizedCaption = body.caption ? sanitizeHtml(body.caption) : undefined;

    const shot = await createWristShot({
      site_id: siteId,
      product_id: body.product_id,
      user_email: body.user_email,
      user_name: body.user_name,
      image_url: body.image_url,
      caption: sanitizedCaption,
    });

    return NextResponse.json(
      { message: "Wrist shot submitted for review", wrist_shot: shot },
      { status: 201 },
    );
  } catch (err) {
    captureException(err, { context: "[wrist-shots] submission failed" });
    return NextResponse.json({ error: "Failed to submit wrist shot" }, { status: 500 });
  }
}
