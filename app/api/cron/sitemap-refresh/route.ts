import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyCronAuth } from "@/lib/cron-auth";

/**
 * POST /api/cron/sitemap-refresh — Revalidate sitemap and content caches.
 * Designed to be called daily (e.g., Cloudflare Cron Trigger at 2:00 AM UTC).
 *
 * Secured via CRON_SECRET env var — pass it in the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Revalidate all cacheable data so the sitemap picks up fresh content
  revalidateTag("content");
  revalidateTag("products");
  revalidateTag("categories");

  return NextResponse.json({
    ok: true,
    revalidated: ["content", "products", "categories"],
    timestamp: new Date().toISOString(),
  });
}
