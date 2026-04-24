import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getServiceClient } from "@/lib/supabase-server";
import { allSiteTags } from "@/lib/cache-tags";
import { captureException } from "@/lib/sentry";

/**
 * POST /api/cron/sitemap-refresh — Revalidate sitemap and content caches.
 * Designed to be called daily (e.g., Cloudflare Cron Trigger at 2:00 AM UTC).
 *
 * Secured via CRON_SECRET env var — pass it in the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Tags are site-scoped (e.g. `content:<site_id>`), so we fan out over every
 * active site rather than firing a single global tag. This matches how admin
 * mutations invalidate caches and keeps multi-site cache behavior consistent.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, { secretEnvVars: ["CRON_SITEMAP_SECRET", "CRON_SECRET"] })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();
  const { data: sites, error } = await sb
    .from("sites")
    .select("id")
    .eq("is_active", true)
    .overrideTypes<{ id: string }[]>();

  if (error) {
    captureException(error, { context: "[api/cron/sitemap-refresh] Failed to list sites:" });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const revalidated: string[] = [];
  for (const site of sites ?? []) {
    for (const tag of allSiteTags(site.id)) {
      void revalidateTag(tag);
      revalidated.push(tag);
    }
  }

  return NextResponse.json({
    ok: true,
    revalidated,
    timestamp: new Date().toISOString(),
  });
}
