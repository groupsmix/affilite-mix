import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServiceClient } from "@/lib/supabase-server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { pingSitemapIndexers } from "@/lib/sitemap-ping";
import type { ContentRow, ProductRow } from "@/types/database";
import { captureException } from "@/lib/sentry";

/**
 * POST /api/cron/publish — Publish scheduled content & products, archive expired items.
 *
 * ## Production Setup (Cloudflare Pages)
 *
 * This endpoint is triggered by the Cloudflare Cron Trigger configured in
 * `wrangler.jsonc` (runs every 5 minutes via `triggers.crons`).
 *
 * Required configuration:
 * 1. Set the CRON_SECRET environment variable in Cloudflare:
 *    `wrangler secret put CRON_SECRET`
 * 2. The cron trigger is defined in `wrangler.jsonc` under `triggers.crons`
 * 3. The scheduled event handler in `instrumentation.ts` dispatches to this route
 *
 * ## Manual Testing
 *
 * ```bash
 * curl -X POST https://your-domain/api/cron/publish \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 * ```
 *
 * Secured via CRON_SECRET env var — pass it in the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();
  const now = new Date().toISOString();
  const results: Record<string, unknown> = {};

  // 1. Publish scheduled content (only explicitly scheduled items with publish_at <= now)
  const { data: contentItems, error: contentError } = await sb
    .from("content")
    .select("id, title, slug")
    .eq("status", "scheduled")
    .not("publish_at", "is", null)
    .lte("publish_at", now)
    .overrideTypes<Pick<ContentRow, "id" | "title" | "slug">[]>();

  if (contentError) {
    captureException(contentError, { context: "[api/cron/publish] Failed to fetch scheduled content:" });
    return NextResponse.json({ error: contentError.message }, { status: 500 });
  }

  if (contentItems && contentItems.length > 0) {
    const ids = contentItems.map((item) => item.id);
    const { error: updateError } = await sb
      .from("content")
      .update({ status: "published" })
      .in("id", ids);

    if (updateError) {
      captureException(updateError, { context: "[api/cron/publish] Failed to publish content:" });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    results.published_content = contentItems.length;
  } else {
    results.published_content = 0;
  }

  // 2. Archive expired content (published with deal_expires_at in the past — future field)
  // Currently content doesn't have deal_expires_at, so this is a no-op placeholder

  // 3. Archive expired products (active with deal_expires_at <= now)
  const { data: expiredProducts, error: expiredError } = await sb
    .from("products")
    .select("id, name, slug")
    .eq("status", "active")
    .not("deal_expires_at", "is", null)
    .lte("deal_expires_at", now)
    .overrideTypes<Pick<ProductRow, "id" | "name" | "slug">[]>();

  if (expiredError) {
    captureException(expiredError, { context: "[api/cron/publish] Failed to fetch expired products:" });
    return NextResponse.json({ error: expiredError.message }, { status: 500 });
  }

  if (expiredProducts && expiredProducts.length > 0) {
    const ids = expiredProducts.map((p) => p.id);
    const { error: archiveError } = await sb
      .from("products")
      .update({ status: "archived" })
      .in("id", ids);

    if (archiveError) {
      captureException(archiveError, { context: "[api/cron/publish] Failed to archive products:" });
      return NextResponse.json({ error: archiveError.message }, { status: 500 });
    }
    results.archived_products = expiredProducts.length;
  } else {
    results.archived_products = 0;
  }

  revalidateTag("content");
  revalidateTag("products");

  // Ping search engines if any content was published
  if ((results.published_content as number) > 0) {
    // Fetch all active site domains to ping their sitemaps
    const { data: sites } = await sb
      .from("sites")
      .select("domain")
      .eq("is_active", true)
      .overrideTypes<{ domain: string }[]>();
    if (sites) {
      for (const site of sites) {
        pingSitemapIndexers(`https://${site.domain}/sitemap.xml`);
      }
    }
  }

  return NextResponse.json(results);
}
