import { NextRequest, NextResponse } from "next/server";
// F-001 (deep audit): cron Worker calls have no x-site-id header so
// tenant JWTs carry no site claim and the tenant_isolation RLS policy
// rejects writes. Cron is CRON_SECRET-gated; use the privileged client
// and do tenant scoping per query.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { upsertProductEpc } from "@/lib/dal/commissions";
import { logger } from "@/lib/logger";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { verifyCronAuth } from "@/lib/cron-auth";
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

    const { data: links, error: linkErr } = await (sb.from as any)("product_affiliate_links")
      .select("product_id, network, url")
      .eq("is_active", true);

    if (linkErr) throw linkErr;
    if (!links || links.length === 0) {
      return NextResponse.json({ message: "No active affiliate links", updated: 0 });
    }

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    let updated = 0;

    for (const link of links as { product_id: string; network: string; url: string }[]) {
      // Count clicks (30d and 7d) — match via affiliate_url from the link
      const { count: clicks30d } = await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("affiliate_clicks")
        .select("*", { count: "exact", head: true })
        .eq("affiliate_url", link.url)
        .gte("created_at", thirtyDaysAgo);

      const { count: clicks7d } = await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("affiliate_clicks")
        .select("*", { count: "exact", head: true })
        .eq("affiliate_url", link.url)
        .gte("created_at", sevenDaysAgo);

      // Sum commissions (30d and 7d)

      const { data: comm30d } = await (sb.from as any)("commissions")
        .select("commission_amount")
        .eq("product_id", link.product_id)
        .eq("network", link.network)
        .in("status", ["approved", "paid"])
        .gte("event_date", thirtyDaysAgo);

      const { data: comm7d } = await (sb.from as any)("commissions")
        .select("commission_amount")
        .eq("product_id", link.product_id)
        .eq("network", link.network)
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
          product_id: link.product_id,
          network: link.network,
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
    logger.error("EPC recompute failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "EPC recompute failed" }, { status: 500 });
  }
}
