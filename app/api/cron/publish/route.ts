import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServiceClient } from "@/lib/supabase-server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { pingSitemapIndexers } from "@/lib/sitemap-ping";
import type { ContentRow, ProductRow } from "@/types/database";
import { captureException } from "@/lib/sentry";
import { contentTag, productsTag } from "@/lib/cache-tags";

/**
 * POST /api/cron/publish â€” Publish scheduled content & products, archive expired items.
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
 * Secured via CRON_SECRET env var â€” pass it in the Authorization header:
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
    captureException(contentError, {
      context: "[api/cron/publish] Failed to fetch scheduled content:",
    });
    return NextResponse.json({ error: contentError.message }, { status: 500 });
  }

  const contentSitesToInvalidate = new Set<string>();
  if (contentItems && contentItems.length > 0) {
    // Use optimistic locking: only update rows still in "scheduled" status
    // to prevent double-publishing if another cron instance runs concurrently.
    const ids = contentItems.map((item) => item.id);
    const { data: updated, error: updateError } = await sb
      .from("content")
      .update({ status: "published" })
      .in("id", ids)
      .eq("status", "scheduled")
      .select("id, site_id")
      .overrideTypes<{ id: string; site_id: string }[]>();

    if (updateError) {
      captureException(updateError, { context: "[api/cron/publish] Failed to publish content:" });
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
    for (const row of updated ?? []) {
      if (row.site_id) contentSitesToInvalidate.add(row.site_id);
    }
    results.published_content = updated?.length ?? 0;
  } else {
    results.published_content = 0;
  }

  // 2. Archive expired content (published with deal_expires_at in the past â€” future field)
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
    captureException(expiredError, {
      context: "[api/cron/publish] Failed to fetch expired products:",
    });
    return NextResponse.json({ error: expiredError.message }, { status: 500 });
  }

  const productSitesToInvalidate = new Set<string>();
  if (expiredProducts && expiredProducts.length > 0) {
    // Optimistic locking: only archive rows still in "active" status
    const ids = expiredProducts.map((p) => p.id);
    const { data: archived, error: archiveError } = await sb
      .from("products")
      .update({ status: "archived" })
      .in("id", ids)
      .eq("status", "active")
      .select("id, site_id")
      .overrideTypes<{ id: string; site_id: string }[]>();

    if (archiveError) {
      captureException(archiveError, { context: "[api/cron/publish] Failed to archive products:" });
      return NextResponse.json({ error: archiveError.message }, { status: 500 });
    }
    for (const row of archived ?? []) {
      if (row.site_id) productSitesToInvalidate.add(row.site_id);
    }
    results.archived_products = archived?.length ?? 0;
  } else {
    results.archived_products = 0;
  }

  // Per-site revalidation — only the sites whose rows actually changed.
  for (const siteId of contentSitesToInvalidate) {
    void revalidateTag(contentTag(siteId));
  }
  for (const siteId of productSitesToInvalidate) {
    void revalidateTag(productsTag(siteId));
  }

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
