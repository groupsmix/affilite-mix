import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { createWristShot, listApprovedWristShots } from "@/lib/dal/community";
import { getClientIp } from "@/lib/get-client-ip";
import { isUsableUuid } from "@/lib/security/uuid";

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
  } catch {
    // fail-open: best-effort
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
    // fail-open: best-effort
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
  } catch {
    // fail-open: best-effort
    return NextResponse.json({ error: "Failed to submit wrist shot" }, { status: 500 });
  }
}
