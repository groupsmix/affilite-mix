import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiError, parseJsonBody } from "@/lib/api-error";
import { getCurrentSite, getSiteIdFromHeader } from "@/lib/site-context";
import { hasSiteFeature } from "@/lib/site-features";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { createWristShot, listApprovedWristShots } from "@/lib/dal/community";
import { getClientIp } from "@/lib/get-client-ip";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { isUsableUuid } from "@/lib/security/uuid";
import { isValidEmail, normalizeEmail } from "@/lib/validate-email";
import { verifyTurnstile } from "@/lib/turnstile";
import { checkImageHostAllowlist } from "@/lib/security/image-host-allowlist";
/** V4-01: Strip bidi-control / invisible chars to prevent homoglyph spoofing. */
function stripBidi(str: string): string {
  return str
    .normalize("NFC")
    .replace(/[\u00AD\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g, "");
}

/**
 * GET /api/community/wrist-shots?product_id=xxx
 * List approved wrist shots for a product.
 *
 * audit5-#3: twin of `/api/community/comments` GET. Adds per-IP rate
 * limit (120 req/min, `failPolicy: "open"`) and UUID validation of
 * `product_id` before the DB is touched. Same rationale as #2: a public
 * read-only endpoint with no validation is a free Supabase
 * pool-exhaustion vector and a 500-spam source for any non-UUID slug
 * Postgres rejects.
 */
export async function GET(request: NextRequest) {
  const site = await getCurrentSite();
  if (!hasSiteFeature(site, "community")) {
    return apiError(404, "Not found", undefined, undefined, "NOT_FOUND");
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`wrist-shots-get:${ip}`, {
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

  const productId = new URL(request.url).searchParams.get("product_id");
  if (!productId || !isUsableUuid(productId)) {
    return NextResponse.json({ error: "product_id is required" }, { status: 400 });
  }

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);
    const shots = await listApprovedWristShots(siteId, productId);
    return NextResponse.json({ wrist_shots: shots });
  } catch (err) {
    // audit5-#10: previously silenced as `// fail-open: best-effort`.
    // Restore observability for the DAL failure path.
    logger.error("community.wrist_shots.list_failed", {
      product_id: productId,
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { context: "api/community/wrist-shots.GET" });
    return NextResponse.json({ error: "Failed to load wrist shots" }, { status: 500 });
  }
}

/**
 * POST /api/community/wrist-shots
 * Submit a wrist shot (goes to moderation queue).
 * Body: { product_id?: string, user_email: string, user_name: string, image_url: string, caption?: string }
 */
export async function POST(request: NextRequest) {
  const site = await getCurrentSite();
  if (!hasSiteFeature(site, "community")) {
    return apiError(404, "Not found", undefined, undefined, "NOT_FOUND");
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(`wrist-shot:${ip}`, {
    maxRequests: 5,
    windowMs: 60 * 60 * 1000,
    failPolicy: "closed" as const,
  });
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
  const parsed = await parseJsonBody(request);
  if (parsed instanceof NextResponse) return parsed;
  body = parsed as typeof body;

  if (!body.user_email || !body.user_name || !body.image_url) {
    return NextResponse.json(
      { error: "user_email, user_name, and image_url are required" },
      { status: 400 },
    );
  }

  // SEC-UUID-01 (#631): Validate product_id is a UUID before DB insert.
  if (body.product_id && !isUsableUuid(body.product_id)) {
    return NextResponse.json({ error: "Invalid product_id" }, { status: 400 });
  }

  // S9-NEW-01: Validate email format.
  if (!isValidEmail(body.user_email)) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  // S9-NEW-01: Validate image_url — must be https and capped at 2048 chars.
  if (body.image_url.length > 2048) {
    return NextResponse.json({ error: "image_url too long" }, { status: 400 });
  }
  let imgUrl: URL;
  try {
    imgUrl = new URL(body.image_url);
    if (imgUrl.protocol !== "https:") {
      return NextResponse.json({ error: "image_url must use https" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid image_url" }, { status: 400 });
  }

  // S11-001: Reject URLs not hosted on an approved image domain.
  const hostCheck = checkImageHostAllowlist(imgUrl.hostname);
  if (!hostCheck.valid) {
    return NextResponse.json({ error: hostCheck.error }, { status: 400 });
  }

  // SEC-TURNSTILE-01 (#628): Turnstile verification is REQUIRED —
  // always call verifyTurnstile so it rejects when Turnstile is enabled
  // but the token is missing. In dev (ENABLE_TURNSTILE unset) it
  // auto-passes; in production omitting the token is a 403.
  const turnstileResult = await verifyTurnstile(body.turnstileToken ?? null, ip);
  if (!turnstileResult.success) {
    return NextResponse.json(
      { error: turnstileResult.error ?? "Captcha verification failed" },
      { status: 403 },
    );
  }

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    const sanitizedName = stripBidi(body.user_name).slice(0, 80);

    const shot = await createWristShot({
      site_id: siteId,
      product_id: body.product_id,
      user_email: normalizeEmail(body.user_email),
      user_name: sanitizedName,
      image_url: body.image_url,
      caption: body.caption ? stripBidi(body.caption).slice(0, 500) : undefined,
    });

    return NextResponse.json(
      { message: "Wrist shot submitted for review", wrist_shot: shot },
      { status: 201 },
    );
  } catch (err) {
    // audit5-#10: previously silenced as `// fail-open: best-effort`.
    // Restore observability for the create-failure path.
    logger.error("community.wrist_shots.create_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    captureException(err, { context: "api/community/wrist-shots.POST" });
    return NextResponse.json({ error: "Failed to submit wrist shot" }, { status: 500 });
  }
}
