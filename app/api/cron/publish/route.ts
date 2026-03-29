import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServiceClient } from "@/lib/supabase-server";
import { verifyCronAuth } from "@/lib/cron-auth";
import type { ContentRow, ProductRow } from "@/types/database";

/**
 * POST /api/cron/publish — Publish scheduled content & products, archive expired items.
 * Designed to be called by a cron job (e.g., Cloudflare Cron Trigger every 5 minutes).
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

  // 1. Publish scheduled content (draft with publish_at <= now)
  const { data: contentItems, error: contentError } = await sb
    .from("content")
    .select("id, title, slug")
    .eq("status", "draft")
    .not("publish_at", "is", null)
    .lte("publish_at", now)
    .overrideTypes<Pick<ContentRow, "id" | "title" | "slug">[]>();

  if (contentError) {
    return NextResponse.json({ error: contentError.message }, { status: 500 });
  }

  if (contentItems && contentItems.length > 0) {
    const ids = contentItems.map((item) => item.id);
    const { error: updateError } = await sb
      .from("content")
      .update({ status: "published" } as never)
      .in("id", ids);

    if (updateError) {
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
    return NextResponse.json({ error: expiredError.message }, { status: 500 });
  }

  if (expiredProducts && expiredProducts.length > 0) {
    const ids = expiredProducts.map((p) => p.id);
    const { error: archiveError } = await sb
      .from("products")
      .update({ status: "archived" } as never)
      .in("id", ids);

    if (archiveError) {
      return NextResponse.json({ error: archiveError.message }, { status: 500 });
    }
    results.archived_products = expiredProducts.length;
  } else {
    results.archived_products = 0;
  }

  revalidateTag("content");
  revalidateTag("products");

  return NextResponse.json(results);
}
