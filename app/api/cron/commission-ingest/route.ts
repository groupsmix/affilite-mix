import { NextRequest, NextResponse } from "next/server";
import { ingestCommissions } from "@/lib/dal/commissions";
import { resolveSiteByTrackingKey } from "@/lib/dal/affiliate-tracking-keys";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import, semgrep.service-role-import
import { logger } from "@/lib/logger";
import { fetchWithTimeout } from "@/lib/fetch-timeout";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { recordAuditEvent } from "@/lib/audit-log";
import { recordCronLiveness } from "@/lib/cron-liveness";

/**
 * GET /api/cron/commission-ingest
 * Nightly cron: pulls commission reports from affiliate networks
 * and ingests them into the commissions table.
 *
 * Currently supports placeholder adapters for CJ, Admitad, PartnerStack.
 * Real API integration requires network API keys configured in env.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/commission-ingest"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // F-019 & F-026 (Scale Risk): Process network ingestions concurrently using Promise.allSettled
  // to avoid hitting Worker execution limits when traffic scales 10x.
  const results: Record<
    string,
    { inserted: number; skipped: number; discarded: number; error?: string }
  > = {};

  const sb = getPrivilegedSupabaseClient();

  const networks: {
    name: string;
    envVar: string;
    fetcher: () => Promise<NormalizedCommission[]>;
  }[] = [
    { name: "cj", envVar: "CJ_API_KEY", fetcher: fetchCjReports },
    { name: "admitad", envVar: "ADMITAD_API_KEY", fetcher: fetchAdmitadReports },
    { name: "partnerstack", envVar: "PARTNERSTACK_API_KEY", fetcher: fetchPartnerStackReports },
  ];

  const tasks = networks.map((network) =>
    (async () => {
      if (!process.env[network.envVar]) {
        results[network.name] = {
          inserted: 0,
          skipped: 0,
          discarded: 0,
          error: `${network.envVar} not configured`,
        };
        return;
      }
      try {
        const reports = await network.fetcher();
        const { resolved, discarded } = await resolveCommissions(reports, sb);
        const ingest = await ingestCommissions(resolved, () => sb);
        results[network.name] = { ...ingest, discarded };
        logger.info(`${network.name} commission ingest complete`, results[network.name]);
      } catch (err) {
        results[network.name] = {
          inserted: 0,
          skipped: 0,
          discarded: 0,
          error: err instanceof Error ? err.message : String(err),
        };
        logger.error(`${network.name} commission ingest failed`, {
          error: results[network.name]!.error,
        });
      }
    })(),
  );

  await Promise.allSettled(tasks);

  void recordCronLiveness("commission-ingest");
  return NextResponse.json({ message: "Commission ingest complete", results });
}

// ── Network adapter stubs ──────────────────────────────────────────
// These return the normalized commission format.
// Replace with real API calls when network credentials are configured.

interface NormalizedCommission {
  tracking_key: string;
  product_id?: string;
  network: string;
  order_id?: string;
  commission_amount: number;
  currency?: string;
  status?: string;
  sale_amount?: number;
  event_date: string;
  raw_data?: Record<string, unknown>;
  // B-F4: response_hmac has been removed. The field was computed in each
  // network fetcher via computeResponseHmac() but was dropped by
  // ResolvedCommission and never stored or verified — a dead integrity
  // control. Removing it prevents false assurance from the F-034 claim.
}

type ResolvedCommission = {
  site_id: string;
  product_id?: string;
  network: string;
  order_id?: string;
  commission_amount: number;
  currency?: string;
  status?: string;
  sale_amount?: number;
  event_date: string;
  raw_data?: Record<string, unknown>;
};

async function resolveCommissions(
  reports: NormalizedCommission[],
  sb: ReturnType<typeof getPrivilegedSupabaseClient>,
): Promise<{ resolved: ResolvedCommission[]; discarded: number }> {
  const resolved: ResolvedCommission[] = [];
  let discarded = 0;

  for (const report of reports) {
    const siteId = await resolveSiteByTrackingKey(report.network, report.tracking_key, () => sb);
    if (siteId) {
      resolved.push({ ...report, site_id: siteId });
    } else {
      discarded++;
      logger.warn("Commission discarded: unregistered tracking key", {
        network: report.network,
        trackingKey: report.tracking_key,
        orderId: report.order_id,
      });
      // Fire-and-forget audit log for unmapped tracking key
      void recordAuditEvent(
        {
          site_id: "00000000-0000-0000-0000-000000000000",
          actor: "commission-ingest-cron",
          action: "commission.discarded.unregistered_tracking_key",
          entity_type: "commission",
          entity_id: report.order_id ?? report.tracking_key,
          details: {
            network: report.network,
            tracking_key: report.tracking_key,
            commission_amount: report.commission_amount,
          },
        },
        () => sb,
      );
    }
  }

  return { resolved, discarded };
}

async function fetchCjReports(): Promise<NormalizedCommission[]> {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) {
    throw new Error("CJ API credentials missing");
  }

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const response = await fetchWithTimeout(
    `https://commission-detail.api.cj.com/v3/commissions?date-type=event&start-date=${startDate}&end-date=${endDate}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      timeoutMs: 30000,
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CJ API failed (${response.status}): ${errorText}`);
  }

  // F-034: Capture raw body for HMAC before JSON parsing
  const rawBody = await response.text();
  const data = JSON.parse(rawBody);
  return (data.commissions || []).map((c: Record<string, unknown>) => ({
    tracking_key: typeof c.shopperId === "string" ? c.shopperId : "",
    order_id: typeof c.actionId === "string" ? c.actionId : undefined,
    network: "cj",
    commission_amount: typeof c.pubCommissionAmountUsd === "number" ? c.pubCommissionAmountUsd : 0,
    sale_amount: typeof c.saleAmountUsd === "number" ? c.saleAmountUsd : undefined,
    status: typeof c.actionStatus === "string" ? c.actionStatus : undefined,
    event_date: typeof c.eventDate === "string" ? c.eventDate : new Date().toISOString(),
    raw_data: c,
  }));
}

async function fetchAdmitadReports(): Promise<NormalizedCommission[]> {
  const apiKey = process.env.ADMITAD_API_KEY;
  if (!apiKey) {
    throw new Error("Admitad API credentials missing");
  }

  const response = await fetchWithTimeout("https://api.admitad.com/statistics/actions/", {
    timeoutMs: 30000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Admitad API failed (${response.status}): ${errorText}`);
  }

  // F-034: Capture raw body before JSON parsing
  const rawBody = await response.text();
  const data = JSON.parse(rawBody);
  return (data.results || []).map((c: Record<string, unknown>) => ({
    tracking_key: typeof c.subid === "string" ? c.subid : "",
    order_id: typeof c.id === "string" ? c.id : typeof c.id === "number" ? String(c.id) : undefined,
    network: "admitad",
    commission_amount: typeof c.payment === "number" ? c.payment : 0,
    currency: typeof c.currency === "string" ? c.currency : undefined,
    status: typeof c.status === "string" ? c.status : undefined,
    event_date: typeof c.action_date === "string" ? c.action_date : new Date().toISOString(),
    raw_data: c,
  }));
}

async function fetchPartnerStackReports(): Promise<NormalizedCommission[]> {
  const apiKey = process.env.PARTNERSTACK_API_KEY;
  if (!apiKey) {
    throw new Error("PartnerStack API credentials missing");
  }

  const response = await fetchWithTimeout("https://api.partnerstack.com/api/v2/transactions", {
    timeoutMs: 30000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PartnerStack API failed (${response.status}): ${errorText}`);
  }

  // F-034: Capture raw body before JSON parsing
  const rawBody = await response.text();
  const data = JSON.parse(rawBody);
  return (data.transactions || []).map((c: Record<string, unknown>) => ({
    tracking_key: typeof c.customer_key === "string" ? c.customer_key : "",
    order_id: typeof c.key === "string" ? c.key : undefined,
    network: "partnerstack",
    commission_amount: typeof c.amount === "number" ? c.amount : 0,
    currency: typeof c.currency === "string" ? c.currency : undefined,
    status: typeof c.status === "string" ? c.status : undefined,
    event_date: typeof c.created_at === "string" ? c.created_at : new Date().toISOString(),
    raw_data: c,
  }));
}
