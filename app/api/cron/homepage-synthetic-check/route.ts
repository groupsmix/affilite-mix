import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { captureException } from "@/lib/sentry";
import { emitMetric } from "@/lib/metrics";
import { recordCronLiveness } from "@/lib/cron-liveness";

/**
 * POST /api/cron/homepage-synthetic-check — Synthetic check for homepage rendering
 *
 * This cron job detects when a homepage renders empty while the database has
 * published content, which indicates a rendering error or cache corruption that
 * would otherwise be invisible to monitoring.
 *
 * Runs every 10 minutes to catch outages quickly.
 *
 * Required configuration:
 * 1. Set CRON_HOMEPAGE_SYNTHETIC_SECRET environment variable
 * 2. Add schedule to wrangler.jsonc triggers.crons
 *
 * Manual testing:
 * ```bash
 * curl -X POST https://your-domain/api/cron/homepage-synthetic-check \
 *   -H "Authorization: Bearer YOUR_CRON_HOMEPAGE_SYNTHETIC_SECRET"
 * ```
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/homepage-synthetic-check"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getPrivilegedSupabaseClient();
  const results: Record<string, unknown> = {
    sites_checked: 0,
    sites_with_empty_homepage: 0,
    sites_with_published_content: 0,
    issues: [] as Array<{ site_id: string; domain: string; reason: string }>,
  };

  try {
    // Fetch all active sites.
    // AUDIT-APPROVED [F-API-01 / homepage-synthetic-check]: cross-site
    // monitoring cron — iterates every active site to detect empty
    // homepages, so no per-request site_id is available. Route is gated
    // by CRON_HOMEPAGE_SYNTHETIC_SECRET via verifyCronAuth() above.
    const { data: sites, error: sitesError } = await sb
      // eslint-disable-next-line no-restricted-syntax -- privileged cron context, see audit comment above
      .from("sites")
      .select("id, domain, slug")
      .eq("is_active", true)
      .unsafeNoSiteFilter();

    if (sitesError) {
      captureException(sitesError, {
        context: "[api/cron/homepage-synthetic-check] Failed to fetch sites",
      });
      return NextResponse.json({ error: "Failed to fetch sites" }, { status: 500 });
    }

    if (!sites || sites.length === 0) {
      logger.info("homepage-synthetic-check: No active sites to check");
      void recordCronLiveness("homepage-synthetic-check");
      return NextResponse.json(results);
    }

    results.sites_checked = sites.length;

    // For each site, check if it has published content and if the homepage would render empty
    for (const site of sites) {
      const siteId = site.id;
      const domain = site.domain;

      // Check if site has published content. Site-scoped via .eq("site_id"),
      // so no .unsafeNoSiteFilter() is needed; raw .from() is acceptable
      // inside this privileged cron route.
      const { data: publishedContent, error: contentError } = await sb
        // eslint-disable-next-line no-restricted-syntax -- privileged cron context; site-scoped via site_id
        .from("content")
        .select("id")
        .eq("site_id", siteId)
        .eq("status", "published")
        .limit(1);

      if (contentError) {
        logger.error("homepage-synthetic-check: Failed to check published content", {
          site_id: siteId,
          error: String(contentError),
        });
        continue;
      }

      const hasPublishedContent = publishedContent && publishedContent.length > 0;

      if (hasPublishedContent) {
        results.sites_with_published_content = (results.sites_with_published_content as number) + 1;

        // Check if homepage would render empty by checking for featured content.
        // This is a simplified check — in production you might want to actually
        // fetch the rendered homepage or check cache state. Site-scoped via
        // .eq("site_id"); raw .from() is acceptable inside this privileged cron.
        const { data: featuredContent, error: featuredError } = await sb
          // eslint-disable-next-line no-restricted-syntax -- privileged cron context; site-scoped via site_id
          .from("content")
          .select("id")
          .eq("site_id", siteId)
          .eq("status", "published")
          .eq("featured", true)
          .limit(1);

        if (featuredError) {
          logger.error("homepage-synthetic-check: Failed to check featured content", {
            site_id: siteId,
            error: String(featuredError),
          });
          continue;
        }

        // If site has published content but no featured content, this might indicate
        // a rendering issue (depending on the site's homepage logic)
        // This is a heuristic - adjust based on your actual homepage rendering logic
        const hasFeaturedContent = featuredContent && featuredContent.length > 0;

        if (!hasFeaturedContent) {
          // Emit a warning metric
          emitMetric("homepage_empty_warning_total", 1, {
            site_id: siteId,
            domain: domain,
          });

          results.sites_with_empty_homepage = (results.sites_with_empty_homepage as number) + 1;
          (results.issues as Array<{ site_id: string; domain: string; reason: string }>).push({
            site_id: siteId,
            domain: domain,
            reason:
              "Published content exists but no featured content found - homepage may render empty",
          });

          // Log a warning
          logger.warn("homepage-synthetic-check: Homepage may render empty", {
            site_id: siteId,
            domain: domain,
            published_content_count: publishedContent.length,
          });

          // If this is a critical issue, capture it in Sentry
          // Adjust the threshold based on your tolerance
          captureException(new Error(`Homepage may render empty for site ${domain} (${siteId})`), {
            context: "[api/cron/homepage-synthetic-check] Homepage rendering issue detected",
            extra: {
              site_id: siteId,
              domain: domain,
              published_content_count: publishedContent.length,
            },
            level: "warning",
          });
        }
      }
    }

    // If any sites have issues, emit a summary metric
    if ((results.sites_with_empty_homepage as number) > 0) {
      emitMetric("homepage_empty_sites_total", results.sites_with_empty_homepage as number);
    }

    void recordCronLiveness("homepage-synthetic-check");

    return NextResponse.json(results);
  } catch (error) {
    captureException(error, {
      context: "[api/cron/homepage-synthetic-check] Unexpected error",
    });
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
