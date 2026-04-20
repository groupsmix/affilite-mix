import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyCronAuth } from "@/lib/cron-auth";
import { listSites } from "@/lib/dal/sites";
import { allSites } from "@/config/sites";
import {
  CACHE_TAG_KINDS,
  allSiteTags,
  isCacheTagKind,
  siteTag,
  type CacheTagKind,
} from "@/lib/cache-tags";

/**
 * POST /api/revalidate — On-demand cache revalidation webhook.
 *
 * Call this after admin content changes to propagate updates immediately
 * instead of waiting for the ISR revalidation interval (1 hour).
 *
 * Secured via CRON_SECRET env var — pass it in the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Body (optional):
 *   {
 *     "site": "watch-tools",          // slug — omit to broadcast to all active sites
 *     "tags": ["content", "products"] // kinds — omit to revalidate all kinds
 *   }
 *
 * Cache tags are site-scoped: a mutation on site A never invalidates site B's
 * cache. The legacy shape `{ tags: ["content"] }` without a `site` still works
 * and fans out to every active site.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let requestedKinds: CacheTagKind[] = [...CACHE_TAG_KINDS];
  let siteFilter: string | null = null;

  try {
    const body = await request.json();
    if (typeof body?.site === "string" && body.site.length > 0) {
      siteFilter = body.site;
    }
    if (Array.isArray(body?.tags) && body.tags.length > 0) {
      const requested = body.tags.filter(isCacheTagKind);
      if (requested.length > 0) requestedKinds = requested;
    }
  } catch {
    // No body or invalid JSON — use defaults
  }

  const slugs = await resolveSiteSlugs(siteFilter);

  const revalidated: string[] = [];
  for (const slug of slugs) {
    for (const kind of requestedKinds) {
      const tag = siteTag(kind, slug);
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

async function resolveSiteSlugs(filter: string | null): Promise<string[]> {
  if (filter) {
    // Fast path: caller specified a site.
    return [filter];
  }

  // Broadcast path: collect every active site (DB-first, config fallback).
  const slugs = new Set<string>();
  try {
    const rows = await listSites();
    for (const row of rows) if (row.is_active) slugs.add(row.slug);
  } catch {
    // DB unreachable — fall through to config
  }
  for (const site of allSites) slugs.add(site.id);
  return [...slugs];
}

// Re-exported for tests that want to assert the tag surface from a single place.
export { allSiteTags };
