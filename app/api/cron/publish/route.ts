import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { getServiceClient } from "@/lib/supabase-server";

/**
 * GET /api/cron/publish — Publish scheduled content whose publish_at has passed.
 * Designed to be called by a cron job (e.g., Cloudflare Cron Trigger every minute).
 *
 * Optionally secured via CRON_SECRET env var — pass it as ?secret=<value>.
 */
export async function GET(request: Request) {
  // Optional secret-based auth for cron
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const { searchParams } = new URL(request.url);
    if (searchParams.get("secret") !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const sb = getServiceClient();

  // Find all content with status = 'draft' and publish_at <= now
  const { data: items, error } = await sb
    .from("content")
    .select("id, title, slug")
    .eq("status", "draft")
    .not("publish_at", "is", null)
    .lte("publish_at", new Date().toISOString());

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ published: 0 });
  }

  // Publish each item
  const ids = items.map((item) => item.id);
  const { error: updateError } = await sb
    .from("content")
    .update({ status: "published" })
    .in("id", ids);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  revalidateTag("content");

  return NextResponse.json({
    published: ids.length,
    items: items.map((i) => ({ id: i.id, title: i.title, slug: i.slug })),
  });
}
