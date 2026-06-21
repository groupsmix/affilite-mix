import { NextRequest, NextResponse } from "next/server";
// F-001 (deep audit): cron Worker calls have no x-site-id header so
// tenant JWTs carry no site claim and the tenant_isolation RLS policy
// rejects writes. Cron is CRON_SECRET-gated; use the privileged client
// and do tenant scoping per query.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { upsertProductEpc } from "@/lib/dal/commissions";
import { logger } from "@/lib/logger";
import { captureException } from "@/lib/sentry";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { verifyCronAuth } from "@/lib/cron-auth";
import { untypedFrom } from "@/lib/dal/type-guards";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";

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

    // B-F1: a product may have multiple active links per (site_id, product_id,
    // network) — e.g. geo-split or weighted A/B links. The previous per-link loop
    // counted clicks for a single URL and then upserted on (site_id, product_id,
    // network), so each iteration overwrote the same row and only the LAST link's
    // click count survived. With two active links A (clicks=a) and B (clicks=b)
    // and total commissions C: stored clicks=b (last), epc=C/b — inflated by
    // (a+b)/b. Group by (site_id, product_id, network) first, collect all URLs,
    // then count with .in() so the stored result is always clicks=a+b, epc=C/(a+b).
    type LinkRow = {
      product_id: string;
      network: string;
      url: string;
      products: { site_id: string };
    };
    type LinkGroup = { site_id: string; product_id: string; network: string; urls: string[] };

    const groups = new Map<string, LinkGroup>();
    for (const link of links as LinkRow[]) {
      const site_id = link.products.site_id;
      const key = `${site_id}|${link.product_id}|${link.network}`;
      const g = groups.get(key);
      if (g) {
        g.urls.push(link.url);
      } else {
        groups.set(key, {
          site_id,
          product_id: link.product_id,
          network: link.network,
          urls: [link.url],
        });
      }
    }

    let updated = 0;

    for (const g of groups.values()) {
      // Count clicks across ALL URLs for this (site, product, network) group.
      const { count: clicks30d } = await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("affiliate_clicks")
        .select("id", { count: "exact", head: true })
        // F-API-01: rollup is per (product, network); intentionally cross-tenant.
        .unsafeNoSiteFilter()
        .in("affiliate_url", g.urls)
        .gte("created_at", thirtyDaysAgo);

      const { count: clicks7d } = await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("affiliate_clicks")
        .select("id", { count: "exact", head: true })
        // F-API-01: rollup is per (product, network); intentionally cross-tenant.
        .unsafeNoSiteFilter()
        .in("affiliate_url", g.urls)
        .gte("created_at", sevenDaysAgo);

      // Sum commissions (30d and 7d) — scoped to this product+network group.
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

      const totalComm30d = (comm30d || []).reduce(
        (sum: number, c: { commission_amount: number }) => sum + Number(c.commission_amount),
        0,
      );
      const totalComm7d = (comm7d || []).reduce(
        (sum: number, c: { commission_amount: number }) => sum + Number(c.commission_amount),
        0,
      );

      const c30 = clicks30d || 0;
      const c7 = clicks7d || 0;

      await upsertProductEpc(
        {
          site_id: g.site_id,
          product_id: g.product_id,
          network: g.network,
          clicks_30d: c30,
          commissions_30d: totalComm30d,
          epc_30d: c30 > 0 ? totalComm30d / c30 : 0,
          clicks_7d: c7,
          commissions_7d: totalComm7d,
          epc_7d: c7 > 0 ? totalComm7d / c7 : 0,
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
