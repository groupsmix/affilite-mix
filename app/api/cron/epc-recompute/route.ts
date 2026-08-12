import { NextRequest, NextResponse } from "next/server";
// F-001 (deep audit): cron Worker calls have no x-site-id header so
// tenant JWTs carry no site claim and the tenant_isolation RLS policy
// rejects writes. Cron is CRON_SECRET-gated; use the privileged client
// and do tenant scoping per query.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { upsertProductEpc } from "@/lib/dal/commissions";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { verifyCronAuth } from "@/lib/cron-auth";
import { untypedFrom } from "@/lib/dal/type-guards";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import {
  groupAffiliateLinks,
  groupClickFilter,
  countGroupClicksByWindow,
  sumCommissions,
  computeEpc,
} from "./aggregation";

/** Keyset page size for click rows; count metadata handles lower server caps. */
const CLICK_SCAN_PAGE_SIZE = 1_000;

/** Absolute anomaly guard for one product/network click group. */
const CLICK_SCAN_MAX_ROWS = 1_000_000;

/**
 * GET /api/cron/epc-recompute
 * Nightly cron: recomputes EPC (earnings per click) stats per product per network.
 * Reads from commissions + affiliate_clicks tables, writes to product_epc_stats.
 * Should run after commission-ingest cron.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/epc-recompute"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sb = getPrivilegedSupabaseClient();

    // Get all product+network combos that have affiliate links

    const { data: links, error: linkErr } = await untypedFrom(sb, "product_affiliate_links")
      .select("product_id, network, url, products!inner(site_id)")
      // F-API-01: nightly EPC recompute reads every site's links so the
      // rollup is global by definition.
      .unsafeNoSiteFilter()
      .eq("is_active", true);

    if (linkErr) throw linkErr;
    if (!links || links.length === 0) {
      return NextResponse.json({ message: "No active affiliate links", updated: 0 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let updated = 0;

    // T3-F1: a product may have multiple active links per network (geo/weight
    // A/B split). The previous per-link loop counted clicks for one URL at a
    // time but summed commissions per (product, network) — so when a product
    // had 2+ active links on the same network, each iteration overwrote the
    // same upsert row with: commissions_total / last_link_clicks = inflated EPC
    // and undercounted clicks. This fed epc-tie-break ranking upward.
    //
    // Fix: group by (site_id, product_id, network), count clicks across ALL
    // the group's URLs, and upsert exactly ONE row per group.
    // Grouping is the pure `groupAffiliateLinks` helper (see ./aggregation).
    const normalizedLinks = (
      links as {
        product_id: string;
        network: string;
        url: string;
        products: { site_id: string };
      }[]
    ).map((link) => ({
      site_id: link.products.site_id,
      product_id: link.product_id,
      network: link.network,
      url: link.url,
    }));
    const groups = groupAffiliateLinks(normalizedLinks);

    for (const g of groups.values()) {
      // Clicks are recorded against the URL the visitor was sent to, which
      // carries UTM and network tracking parameters the configured link does
      // not have. Match on the destination prefix and settle each row in code
      // (see ./aggregation), instead of on string equality that never matched.
      let clicks30d = 0;
      let clicks7d = 0;
      let scannedClickRows = 0;
      let lastClickId: string | null = null;
      let totalMatchingClickRows: number | null = null;

      while (scannedClickRows < CLICK_SCAN_MAX_ROWS) {
        let clickQuery = sb
          // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
          .from("affiliate_clicks")
          .select(
            "id, affiliate_url, created_at",
            lastClickId === null ? { count: "exact" } : undefined,
          )
          // F-API-01: rollup is per (product, network); intentionally cross-tenant.
          .unsafeNoSiteFilter()
          .or(groupClickFilter(g.urls))
          .gte("created_at", thirtyDaysAgo)
          .order("id", { ascending: true })
          .limit(CLICK_SCAN_PAGE_SIZE);

        if (lastClickId) clickQuery = clickQuery.gt("id", lastClickId);

        const { data: clickRows, error: clickErr, count } = await clickQuery;
        if (clickErr) throw clickErr;
        // Only the first request has an exact count. Once the keyset cursor
        // is applied, PostgREST's count describes the remaining rows rather
        // than the total, so it cannot be compared with the accumulated scan.
        if (lastClickId === null && count !== null) totalMatchingClickRows = count;

        const pageRows = (clickRows ?? []) as {
          id: string;
          affiliate_url: string;
          created_at: string;
        }[];
        if (pageRows.length === 0) break;

        const pageCounts = countGroupClicksByWindow(pageRows, g.urls, sevenDaysAgo);
        clicks30d += pageCounts.clicks30d;
        clicks7d += pageCounts.clicks7d;
        scannedClickRows += pageRows.length;
        lastClickId = pageRows[pageRows.length - 1]?.id ?? null;

        // Do not use page length as the end condition: PostgREST may apply a
        // lower max-rows cap than requested. Exact count metadata tells us
        // when all matching rows have been consumed.
        if (totalMatchingClickRows !== null && scannedClickRows >= totalMatchingClickRows) {
          break;
        }
        if (!lastClickId) break;
      }

      if (
        scannedClickRows >= CLICK_SCAN_MAX_ROWS &&
        (totalMatchingClickRows === null || scannedClickRows < totalMatchingClickRows)
      ) {
        logger.warn("[cron/epc-recompute] click scan hit its limit; EPC may be understated", {
          product_id: g.product_id,
          network: g.network,
          limit: CLICK_SCAN_MAX_ROWS,
        });
      }

      // Sum commissions (30d and 7d)
      const { data: comm30d } = await untypedFrom(sb, "commissions")
        .select("commission_amount")
        // F-API-01: rollup is per (product, network); intentionally cross-tenant.
        .unsafeNoSiteFilter()
        .eq("product_id", g.product_id)
        .eq("network", g.network)
        .in("status", ["approved", "paid"])
        .gte("event_date", thirtyDaysAgo);

      const { data: comm7d } = await untypedFrom(sb, "commissions")
        .select("commission_amount")
        // F-API-01: rollup is per (product, network); intentionally cross-tenant.
        .unsafeNoSiteFilter()
        .eq("product_id", g.product_id)
        .eq("network", g.network)
        .in("status", ["approved", "paid"])
        .gte("event_date", sevenDaysAgo);

      const totalComm30d = sumCommissions(comm30d);
      const totalComm7d = sumCommissions(comm7d);

      await upsertProductEpc(
        {
          site_id: g.site_id,
          product_id: g.product_id,
          network: g.network,
          clicks_30d: clicks30d,
          commissions_30d: totalComm30d,
          epc_30d: computeEpc(totalComm30d, clicks30d),
          clicks_7d: clicks7d,
          commissions_7d: totalComm7d,
          epc_7d: computeEpc(totalComm7d, clicks7d),
        },
        getPrivilegedSupabaseClient,
      );

      updated++;
    }

    logger.info(`EPC recompute complete: updated ${updated} product-network pairs`);
    void recordCronLiveness("epc-recompute");
    return NextResponse.json({ message: "EPC recompute complete", updated });
  } catch (err) {
    captureException(err, { context: "[cron/epc-recompute] failed" });
    logger.error("EPC recompute failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "EPC recompute failed" }, { status: 500 });
  }
}
