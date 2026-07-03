import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { logger } from "@/lib/logger";
// F-001 (deep audit): cron routes invoked from the Cloudflare Worker have
// no `x-site-id` request header (there are no cookies, no admin session,
// and a single cron may iterate many sites). The tenant JWT minted by
// `getTenantClient()` would therefore carry no site claim and fail the
// `tenant_isolation_auth_<t>` RLS predicate from migration 00067.
// Cron is already gated by `CRON_SECRET`, so the privileged server-only
// Supabase client is the correct model — every query in this route
// must perform its own tenant scoping.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { pingSitemapIndexers } from "@/lib/sitemap-ping";
import type { ContentRow, ProductRow } from "@/types/database";
import { captureException } from "@/lib/sentry";
import { contentTag, productsTag } from "@/lib/cache-tags";
import { recordCronLiveness, checkCronLiveness } from "@/lib/cron-liveness";

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
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/publish"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getPrivilegedSupabaseClient();
  // A28-003: Use DB now() for scheduling decisions instead of worker clock.
  // Edge clock skew can cause early/late publishing. DB is the authoritative time source.
  //
  // audit5-#23: the previous revision fell back to `new Date().toISOString()`
  // when `db_now()` returned null/undefined, which silently undermined the
  // "DB is the authoritative clock" guarantee. A null return from `db_now`
  // is not a normal condition — it means either the RPC is missing
  // (deployment skipped a migration) or the Postgres session lost its
  // clock connection. Both are bugs the operator must see, not race
  // around. We now refuse to publish on this signal and surface the
  // misconfiguration via Sentry + a 503 response so the cron retries
  // with backoff instead of double-publishing on the next tick.
  // F-API-01 / NEW-03: db_now() is a cross-tenant utility RPC (no
  // p_site_id) — opt out of the RPC guard.
  const { data: dbNowResult, error: dbNowError } = await sb.rpc("db_now").unsafeNoSiteFilter();
  if (dbNowError || dbNowResult == null) {
    captureException(dbNowError ?? new Error("db_now() returned null/undefined"), {
      context: "[api/cron/publish] cron clock unavailable — refusing to publish on worker clock",
      route: "/api/cron/publish",
    });
    return NextResponse.json(
      {
        error:
          "Database clock unavailable. Refusing to publish on worker time — cron will retry on next tick.",
      },
      { status: 503 },
    );
  }
  const dbNow = dbNowResult as string;
  // Also capture worker time for drift detection logging
  const workerNow = new Date().toISOString();
  const clockSkewMs = Math.abs(new Date(dbNow).getTime() - new Date(workerNow).getTime());
  if (clockSkewMs > 30_000) {
    logger.warn("cron.clock_skew", {
      skew_ms: clockSkewMs,
      db_now: dbNow,
      worker_now: workerNow,
    });
  }
  if (clockSkewMs > 5 * 60_000) {
    captureException(new Error("cron.publish excessive clock skew"), {
      context: "[api/cron/publish] excessive worker/database clock skew",
      route: "/api/cron/publish",
      extra: { clockSkewMs, dbNow, workerNow },
    });
    return NextResponse.json(
      {
        error:
          "Worker/database clock skew exceeds the safe publish threshold. Refusing to publish until clocks recover.",
      },
      { status: 503 },
    );
  }
  const results: Record<string, unknown> = {};

  // 1. Publish scheduled content (only explicitly scheduled items with publish_at <= now)
  // SEC-13: Also fetch ai_generated + human_reviewed_at so we can gate AI content.
  const { data: contentItems, error: contentError } = await sb
    // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
    .from("content")
    .select("id, title, slug, ai_generated, human_reviewed_at")
    // F-API-01: cron sweeps every site's scheduled content in one query;
    // explicit cross-tenant opt-out is required by the privileged-client Proxy.
    .unsafeNoSiteFilter()
    .eq("status", "scheduled")
    .not("publish_at", "is", null)
    .lte("publish_at", dbNow)
    .overrideTypes<
      Pick<ContentRow, "id" | "title" | "slug"> & {
        ai_generated: boolean;
        human_reviewed_at: string | null;
      }
    >();

  if (contentError) {
    captureException(contentError, {
      context: "[api/cron/publish] Failed to fetch scheduled content:",
    });
    return NextResponse.json({ error: "Failed to fetch scheduled content" }, { status: 500 });
  }

  const contentSitesToInvalidate = new Set<string>();
  let skippedAiContent = 0;
  if (contentItems && contentItems.length > 0) {
    // SEC-13: AI-generated content requires human_reviewed_at to be non-null
    // before it can be auto-published. Skip items that fail this gate.
    const publishable: string[] = [];
    for (const item of contentItems) {
      if (item.ai_generated && !item.human_reviewed_at) {
        skippedAiContent++;
        logger.warn("cron.publish.ai_review_gate", {
          content_id: item.id,
          title: item.title,
          reason: "AI-generated content requires human review before auto-publish",
        });
        continue;
      }
      publishable.push(item.id);
    }

    if (publishable.length > 0) {
      // Use optimistic locking: only update rows still in "scheduled" status
      // to prevent double-publishing if another cron instance runs concurrently.
      const { data: updated, error: updateError } = await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("content")
        .update({ status: "published" })
        // F-API-01: ids were already resolved across tenants in the
        // previous query; this update is the optimistic-locking step
        // and is gated by `publishable` (a finite, pre-authorised id list).
        .unsafeNoSiteFilter()
        .in("id", publishable)
        .eq("status", "scheduled")
        .select("id, site_id")
        .overrideTypes<{ id: string; site_id: string }[]>();

      if (updateError) {
        captureException(updateError, {
          context: "[api/cron/publish] Failed to publish content:",
        });
        return NextResponse.json({ error: "Failed to publish content" }, { status: 500 });
      }
      for (const row of updated ?? []) {
        if (row.site_id) contentSitesToInvalidate.add(row.site_id);
      }
      results.published_content = updated?.length ?? 0;
    } else {
      results.published_content = 0;
    }
    results.skipped_ai_unreviewed = skippedAiContent;
  } else {
    results.published_content = 0;
    results.skipped_ai_unreviewed = 0;
  }

  // 2. Archive expired content (published with deal_expires_at in the past â€” future field)
  // Currently content doesn't have deal_expires_at, so this is a no-op placeholder

  // 3. Archive expired products (active with deal_expires_at <= dbNow)
  const { data: expiredProducts, error: expiredError } = await sb
    // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
    .from("products")
    .select("id, name, slug")
    // F-API-01: cross-tenant cron sweep — see content query above.
    .unsafeNoSiteFilter()
    .eq("status", "active")
    .not("deal_expires_at", "is", null)
    .lte("deal_expires_at", dbNow)
    .overrideTypes<Pick<ProductRow, "id" | "name" | "slug">[]>();

  if (expiredError) {
    captureException(expiredError, {
      context: "[api/cron/publish] Failed to fetch expired products:",
    });
    return NextResponse.json({ error: "Failed to fetch expired products" }, { status: 500 });
  }

  const productSitesToInvalidate = new Set<string>();
  if (expiredProducts && expiredProducts.length > 0) {
    // Optimistic locking: only archive rows still in "active" status
    const ids = expiredProducts.map((p: { id: string }) => p.id);
    const { data: archived, error: archiveError } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
      .from("products")
      .update({ status: "archived" })
      // F-API-01: ids resolved cross-tenant above; this is the
      // optimistic-locking write step.
      .unsafeNoSiteFilter()
      .in("id", ids)
      .eq("status", "active")
      .select("id, site_id")
      .overrideTypes<{ id: string; site_id: string }[]>();

    if (archiveError) {
      captureException(archiveError, { context: "[api/cron/publish] Failed to archive products:" });
      return NextResponse.json({ error: "Failed to archive products" }, { status: 500 });
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
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
      .from("sites")
      .select("domain")
      // F-API-01: `sites` is a global table with no `site_id` column; the
      // Proxy requires the explicit opt-out here.
      .unsafeNoSiteFilter()
      .eq("is_active", true)
      .overrideTypes<{ domain: string }[]>();
    if (sites) {
      for (const site of sites) {
        void pingSitemapIndexers(`https://${site.domain}/sitemap.xml`);
      }
    }
  }

  // FIX-16 (F-023): Record liveness for this cron job and check all others
  void recordCronLiveness("publish");
  void checkCronLiveness();

  return NextResponse.json(results);
}
