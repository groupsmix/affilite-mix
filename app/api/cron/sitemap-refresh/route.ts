import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyCronAuth } from "@/lib/cron-auth";
import { listSites } from "@/lib/dal/sites";
import { allSiteTags } from "@/lib/cache-tags";
import { allSites } from "@/config/sites";

/**
 * POST /api/cron/sitemap-refresh — Revalidate sitemap and content caches.
 * Designed to be called daily (e.g., Cloudflare Cron Trigger at 2:00 AM UTC).
 *
 * Secured via CRON_SECRET env var — pass it in the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Revalidates per-site cache tags so each site gets its own fresh content
 * rather than relying on a shared "content" tag that would over-invalidate.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Prefer DB-registered sites (includes dashboard-managed ones); fall back to
  // static config when the DB is unreachable so cron never silently no-ops.
  const slugs = new Set<string>();
  try {
    const rows = await listSites();
    for (const row of rows) if (row.is_active) slugs.add(row.slug);
  } catch {
    // DB unreachable — fall through to config
  }
  for (const site of allSites) slugs.add(site.id);

  const revalidated: string[] = [];
  for (const slug of slugs) {
    for (const tag of allSiteTags(slug)) {
      void revalidateTag(tag);
      revalidated.push(tag);
    }
  }

  return NextResponse.json({
    ok: true,
    sites: [...slugs],
    revalidated,
    timestamp: new Date().toISOString(),
  });
}
