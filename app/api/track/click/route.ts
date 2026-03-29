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
  const rl = await checkRateLimit(`click:${ip}`, CLICK_RATE_LIMIT);
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

  // Validate product exists for this site
  const product = await getProductBySlug(siteId, productSlug);
  if (!product || !product.affiliate_url) {
    return NextResponse.json(
      { error: "Product not found or has no affiliate URL" },
      { status: 404 },
    );
  }

  // Use the product's stored affiliate URL as the canonical redirect target.
  // The `d` parameter is only used as a hint for backwards compat but the
  // actual redirect always goes to the DB-stored URL, preventing open redirects.
  const destinationUrl = product.affiliate_url;

  // Record click (fire-and-forget)
  recordClick({
    site_id: siteId,
    product_name: product.name,
    affiliate_url: destinationUrl,
    content_slug: searchParams.get("t") ?? "",
    referrer: request.headers.get("referer") ?? undefined,
  });

  // 302 redirect to the product's affiliate URL
  return NextResponse.redirect(destinationUrl, 302);
}
