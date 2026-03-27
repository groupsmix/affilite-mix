import { NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/dal/affiliate-clicks";
import { getProductBySlug } from "@/lib/dal/products";
import { getSiteIdFromHeader } from "@/lib/site-context";
import { resolveDbSiteId } from "@/lib/dal/site-resolver";
import { checkRateLimit } from "@/lib/rate-limit";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

/** 60 click-tracking requests per minute per IP */
const CLICK_RATE_LIMIT = { maxRequests: 60, windowMs: 60 * 1000 };

function isValidDestination(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const rl = checkRateLimit(`click:${ip}`, CLICK_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      },
    );
  }

  const siteSlug = getSiteIdFromHeader(request.headers.get("x-site-id"));
  const siteId = await resolveDbSiteId(siteSlug);

  const { searchParams } = request.nextUrl;
  const productSlug = searchParams.get("p");
  const destination = searchParams.get("d");

  if (!productSlug || !destination) {
    return NextResponse.json(
      { error: "Missing required parameters: p, d" },
      { status: 400 },
    );
  }

  // Decode destination URL
  let destinationUrl: string;
  try {
    destinationUrl = Buffer.from(destination, "base64").toString("utf-8");
  } catch {
    return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
  }

  // Validate destination is a safe http(s) URL
  if (!isValidDestination(destinationUrl)) {
    return NextResponse.json(
      { error: "Destination must be an http or https URL" },
      { status: 400 },
    );
  }

  // Validate product exists for this site
  const product = await getProductBySlug(siteId, productSlug);

  // Record click (fire-and-forget)
  recordClick({
    site_id: siteId,
    product_name: product?.name ?? productSlug,
    affiliate_url: destinationUrl,
    content_slug: searchParams.get("t") ?? "",
    referrer: request.headers.get("referer") ?? undefined,
  });

  // 302 redirect to affiliate URL
  return NextResponse.redirect(destinationUrl, 302);
}
