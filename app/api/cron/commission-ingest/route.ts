import { NextRequest, NextResponse } from "next/server";
import { ingestCommissions } from "@/lib/dal/commissions";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/commission-ingest
 * Nightly cron: pulls commission reports from affiliate networks
 * and ingests them into the commissions table.
 *
 * Currently supports placeholder adapters for CJ, Admitad, PartnerStack.
 * Real API integration requires network API keys configured in env.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, { inserted: number; skipped: number; error?: string }> = {};

  // ── CJ (Commission Junction) ──────────────────────────────
  if (process.env.CJ_API_KEY) {
    try {
      const reports = await fetchCjReports();
      results.cj = await ingestCommissions(reports);
      logger.info("CJ commission ingest complete", results.cj);
    } catch (err) {
      results.cj = {
        inserted: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      logger.error("CJ commission ingest failed", { error: results.cj.error });
    }
  } else {
    results.cj = { inserted: 0, skipped: 0, error: "CJ_API_KEY not configured" };
  }

  // ── Admitad ────────────────────────────────────────────────
  if (process.env.ADMITAD_API_KEY) {
    try {
      const reports = await fetchAdmitadReports();
      results.admitad = await ingestCommissions(reports);
      logger.info("Admitad commission ingest complete", results.admitad);
    } catch (err) {
      results.admitad = {
        inserted: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      logger.error("Admitad commission ingest failed", { error: results.admitad.error });
    }
  } else {
    results.admitad = { inserted: 0, skipped: 0, error: "ADMITAD_API_KEY not configured" };
  }

  // ── PartnerStack ──────────────────────────────────────────
  if (process.env.PARTNERSTACK_API_KEY) {
    try {
      const reports = await fetchPartnerStackReports();
      results.partnerstack = await ingestCommissions(reports);
      logger.info("PartnerStack commission ingest complete", results.partnerstack);
    } catch (err) {
      results.partnerstack = {
        inserted: 0,
        skipped: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      logger.error("PartnerStack commission ingest failed", { error: results.partnerstack.error });
    }
  } else {
    results.partnerstack = {
      inserted: 0,
      skipped: 0,
      error: "PARTNERSTACK_API_KEY not configured",
    };
  }

  return NextResponse.json({ message: "Commission ingest complete", results });
}

// ── Network adapter stubs ──────────────────────────────────────────
// These return the normalized commission format.
// Replace with real API calls when network credentials are configured.

interface NormalizedCommission {
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
}

async function fetchCjReports(): Promise<NormalizedCommission[]> {
  // TODO: Implement CJ Commission Detail Report API
  // https://developers.cj.com/docs/commission-detail
  // GET https://commission-detail.api.cj.com/v3/commissions
  // Headers: Authorization: Bearer {CJ_API_KEY}
  // Query: date-type=event&start-date=YYYY-MM-DD&end-date=YYYY-MM-DD
  logger.info("CJ commission fetch: stub — implement with CJ API credentials");
  return [];
}

async function fetchAdmitadReports(): Promise<NormalizedCommission[]> {
  // TODO: Implement Admitad Statistics API
  // https://developers.admitad.com/en/doc/api_en/methods/statistics/
  // GET https://api.admitad.com/statistics/actions/
  logger.info("Admitad commission fetch: stub — implement with Admitad API credentials");
  return [];
}

async function fetchPartnerStackReports(): Promise<NormalizedCommission[]> {
  // TODO: Implement PartnerStack Transactions API
  // https://docs.partnerstack.com/reference/get-transactions
  // GET https://api.partnerstack.com/api/v2/transactions
  logger.info("PartnerStack commission fetch: stub — implement with PartnerStack API credentials");
  return [];
}
