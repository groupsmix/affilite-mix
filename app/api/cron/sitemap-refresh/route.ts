import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
// F-001 (deep audit): cron Worker calls have no x-site-id header so
// tenant JWTs carry no site claim and the tenant_isolation RLS policy
// rejects writes. Cron is CRON_SECRET-gated; use the privileged client
// and do tenant scoping per query.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { allSiteTags } from "@/lib/cache-tags";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import {
  getSearchConsoleAccessToken,
  getSearchConsolePropertyType,
  submitSitemap,
  type SearchConsoleSubmitResult,
} from "@/lib/seo/search-console";

/**
 * POST /api/cron/sitemap-refresh — Revalidate sitemaps and content caches,
 * then submit each active site's sitemap to Google Search Console.
 * Designed to be called daily (e.g., Cloudflare Cron Trigger at 3:00 AM UTC).
 *
 * Secured via CRON_SECRET env var — pass it in the Authorization header:
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Tags are site-scoped (e.g. `content:<site_id>`), so we fan out over every
 * active site rather than firing a single global tag. This matches how admin
 * mutations invalidate caches and keeps multi-site cache behavior consistent.
 *
 * Search Console submission is best-effort: it is skipped unless
 * GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN is configured, so a missing credential
 * does not fail the refresh or block cache revalidation.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/sitemap-refresh"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getPrivilegedSupabaseClient();
  const { data: sites, error } = await sb
    // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
    .from("sites")
    .select("id, domain")
    // F-API-01: `sites` is a global table with no `site_id` column.
    .unsafeNoSiteFilter()
    .eq("is_active", true)
    .overrideTypes<{ id: string; domain: string }[]>();

  if (error) {
    captureException(error, { context: "[api/cron/sitemap-refresh] Failed to list sites:" });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const revalidated: string[] = [];
  const searchConsoleResults: SearchConsoleSubmitResult[] = [];
  const accessToken = getSearchConsoleAccessToken();
  const propertyType = getSearchConsolePropertyType();
  const hasSearchConsoleToken = !!accessToken;

  if (!hasSearchConsoleToken) {
    logger.info(
      "[cron/sitemap-refresh] GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN not set; skipping Search Console submission",
    );
  }

  for (const site of sites ?? []) {
    for (const tag of allSiteTags(site.id)) {
      void revalidateTag(tag);
      revalidated.push(tag);
    }

    if (hasSearchConsoleToken && site.domain) {
      const feedpath = `https://${site.domain}/sitemap.xml`;
      const result = await submitSitemap({
        domain: site.domain,
        propertyType,
        accessToken,
        feedpath,
      });
      searchConsoleResults.push(result);
    }
  }

  const submittedCount = searchConsoleResults.filter((r) => r.ok).length;
  const failedCount = searchConsoleResults.length - submittedCount;

  if (hasSearchConsoleToken && (submittedCount > 0 || failedCount > 0)) {
    logger.info("[cron/sitemap-refresh] Search Console submission summary", {
      submitted: submittedCount,
      failed: failedCount,
      total: searchConsoleResults.length,
    });
  }

  void recordCronLiveness("sitemap-refresh");
  return NextResponse.json({
    ok: true,
    revalidated,
    searchConsole: {
      enabled: hasSearchConsoleToken,
      submitted: submittedCount,
      failed: failedCount,
      results: searchConsoleResults,
    },
    timestamp: new Date().toISOString(),
  });
}
