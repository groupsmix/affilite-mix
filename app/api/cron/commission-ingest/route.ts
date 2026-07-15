import { NextRequest, NextResponse } from "next/server";
import { ingestCommissions } from "@/lib/dal/commissions";
import { resolveSiteByTrackingKey } from "@/lib/dal/affiliate-tracking-keys";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
import { logger } from "@/lib/logger";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { recordAuditEvent } from "@/lib/audit-log";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { captureException } from "@/lib/sentry";
import { apiError } from "@/lib/api-error";
import {
  fetchPaginatedReports,
  normalizeAdmitadCommission,
  normalizeCjCommission,
  normalizePartnerStackCommission,
} from "@/lib/commission-adapters";
import { validateCommissionReport, type CommissionReport } from "@/lib/commission-validation";

/**
 * GET /api/cron/commission-ingest
 * Nightly cron: pulls commission reports from affiliate networks
 * and ingests them into the commissions table.
 *
 * Hardening applied:
 * - Retry with exponential backoff for transient network failures.
 * - Pagination support for CJ, Admitad, and PartnerStack (stops on empty page).
 * - Schema validation of each raw report before ingestion.
 * - Per-network accounting (fetched, valid, discarded, inserted, skipped).
 * - 502 response when every configured network fails, so the cron is marked
 *   failed and alerting fires instead of swallowing errors in a 200 body.
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/commission-ingest"))) {
    return apiError(401, "Unauthorized", undefined, undefined, "UNAUTHORIZED");
  }

  const sb = getPrivilegedSupabaseClient();

  type NetworkResult = {
    fetched: number;
    valid: number;
    discarded: number;
    inserted: number;
    skipped: number;
    error?: string;
  };

  const results: Record<string, NetworkResult> = {};
  let configuredNetworks = 0;
  let successfulNetworks = 0;

  const networks: {
    name: string;
    envVar: string;
    fetcher: () => Promise<unknown[]>;
  }[] = [
    { name: "cj", envVar: "CJ_API_KEY", fetcher: fetchCjReports },
    { name: "admitad", envVar: "ADMITAD_API_KEY", fetcher: fetchAdmitadReports },
    { name: "partnerstack", envVar: "PARTNERSTACK_API_KEY", fetcher: fetchPartnerStackReports },
  ];

  for (const network of networks) {
    results[network.name] = {
      fetched: 0,
      valid: 0,
      discarded: 0,
      inserted: 0,
      skipped: 0,
    };

    const apiKey = process.env[network.envVar];
    if (!apiKey) {
      results[network.name]!.error = `${network.envVar} not configured`;
      continue;
    }

    configuredNetworks++;

    let reports: unknown[];
    try {
      reports = await network.fetcher();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[network.name]!.error = message;
      logger.error(`[commission-ingest] ${network.name} fetch failed`, { error: message });
      captureException(err instanceof Error ? err : new Error(message), {
        context: "[commission-ingest] network fetch failed",
        network: network.name,
      });
      continue;
    }

    const validated: CommissionReport[] = [];
    for (const raw of reports) {
      const parsed = validateCommissionReport(raw);
      if (parsed.errors) {
        logger.warn("[commission-ingest] discarding invalid report", {
          network: network.name,
          errors: parsed.errors,
          raw,
        });
      } else {
        validated.push(parsed.data);
      }
    }

    results[network.name]!.fetched = reports.length;
    results[network.name]!.valid = validated.length;

    try {
      const { resolved, discarded } = await resolveCommissions(validated, sb);
      const ingest = await ingestCommissions(resolved, () => sb);
      results[network.name]!.discarded = discarded;
      results[network.name]!.inserted = ingest.inserted;
      results[network.name]!.skipped = ingest.skipped;
      successfulNetworks++;
      logger.info(`[commission-ingest] ${network.name} ingest complete`, results[network.name]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[network.name]!.error = message;
      logger.error(`[commission-ingest] ${network.name} ingest failed`, { error: message });
      captureException(err instanceof Error ? err : new Error(message), {
        context: "[commission-ingest] network ingest failed",
        network: network.name,
      });
    }
  }

  void recordCronLiveness("commission-ingest");

  if (configuredNetworks > 0 && successfulNetworks === 0) {
    const failure = new Error("All configured commission networks failed");
    captureException(failure, { context: "[commission-ingest] all networks failed", results });
    return apiError(
      502,
      "All configured commission networks failed",
      results,
      undefined,
      "COMMISSION_INGEST_ALL_NETWORKS_FAILED",
    );
  }

  return NextResponse.json({
    message: "Commission ingest complete",
    partial: configuredNetworks > 0 && successfulNetworks < configuredNetworks,
    results,
  });
}

// ── Network adapter stubs ──────────────────────────────────────────
// These return the normalized commission format.
// Replace with real API calls when network credentials are configured.

type ResolvedCommission = {
  site_id: string;
  product_id?: string;
  click_id?: string;
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
  reports: CommissionReport[],
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

async function fetchCjReports(): Promise<unknown[]> {
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) {
    throw new Error("CJ API credentials missing");
  }

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const items = await fetchPaginatedReports({
    label: "CJ",
    buildUrl: (page) =>
      `https://commission-detail.api.cj.com/v3/commissions?date-type=event&start-date=${startDate}&end-date=${endDate}&page-number=${page}`,
    extractItems: (data: unknown) => {
      if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
      const commissions = (data as Record<string, unknown>).commissions;
      return commissions;
    },
    requestInit: {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  });

  return items.map(normalizeCjCommission);
}

async function fetchAdmitadReports(): Promise<unknown[]> {
  const apiKey = process.env.ADMITAD_API_KEY;
  if (!apiKey) {
    throw new Error("Admitad API credentials missing");
  }

  const items = await fetchPaginatedReports({
    label: "Admitad",
    buildUrl: (page) => {
      const limit = 100;
      const offset = (page - 1) * limit;
      return `https://api.admitad.com/statistics/actions/?limit=${limit}&offset=${offset}`;
    },
    extractItems: (data: unknown) => {
      if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
      const results = (data as Record<string, unknown>).results;
      return results;
    },
    requestInit: {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  });

  return items.map(normalizeAdmitadCommission);
}

async function fetchPartnerStackReports(): Promise<unknown[]> {
  const apiKey = process.env.PARTNERSTACK_API_KEY;
  if (!apiKey) {
    throw new Error("PartnerStack API credentials missing");
  }

  const items = await fetchPaginatedReports({
    label: "PartnerStack",
    buildUrl: (page) => `https://api.partnerstack.com/api/v2/transactions?page=${page}`,
    extractItems: (data: unknown) => {
      if (typeof data !== "object" || data === null || Array.isArray(data)) return undefined;
      const transactions = (data as Record<string, unknown>).transactions;
      return transactions;
    },
    requestInit: {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  });

  return items.map(normalizePartnerStackCommission);
}
