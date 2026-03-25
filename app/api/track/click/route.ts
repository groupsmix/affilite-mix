import { NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/dal/affiliate-clicks";
import { getProductBySlug } from "@/lib/dal/products";
import { getSiteIdFromHeader } from "@/lib/site-context";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function isValidDestination(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const siteId = getSiteIdFromHeader(request.headers.get("x-site-id"));

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

  // Hash IP for privacy
  const forwardedFor = request.headers.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = await hashIp(ip);

  // Record click (fire-and-forget)
  recordClick({
    site_id: siteId,
    product_id: product?.id,
    product_slug: productSlug,
    source_page: request.headers.get("referer") ?? "",
    source_type: searchParams.get("t") ?? "unknown",
    destination_url: destinationUrl,
    ip_hash: ipHash,
    user_agent: request.headers.get("user-agent") ?? undefined,
    referrer: request.headers.get("referer") ?? undefined,
    country: request.headers.get("cf-ipcountry") ?? undefined,
  });

  // 302 redirect to affiliate URL
  return NextResponse.redirect(destinationUrl, 302);
}

async function hashIp(ip: string): Promise<string> {
  const salt = new Date().toISOString().slice(0, 10); // daily salt
  const data = new TextEncoder().encode(ip + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
