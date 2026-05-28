import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { createWristShot, listApprovedWristShots } from "@/lib/dal/community";
import { getClientIp } from "@/lib/get-client-ip";
import { logger } from "@/lib/logger";
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
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`wrist-shot:${ip}`, { maxRequests: 5, windowMs: 60 * 60 * 1000 });
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
  };
  try {
    body = await request.json();
  } catch {
    // audit5-#10: malformed JSON is a 400 (client error); do not log.
    // See app/api/community/comments/route.ts for the rationale.
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.user_email || !body.user_name || !body.image_url) {
    return NextResponse.json(
      { error: "user_email, user_name, and image_url are required" },
      { status: 400 },
    );
  }

  try {
    const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
    const siteId = await resolveDbSiteId(siteSlug);

    const shot = await createWristShot({
      site_id: siteId,
      product_id: body.product_id,
      user_email: body.user_email,
      user_name: body.user_name,
      image_url: body.image_url,
      caption: body.caption,
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
