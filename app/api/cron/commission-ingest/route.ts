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
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) {
    throw new Error("CJ API credentials missing");
  }

  const endDate = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  const response = await fetch(
    `https://commission-detail.api.cj.com/v3/commissions?date-type=event&start-date=${startDate}&end-date=${endDate}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`CJ API failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return (data.commissions || []).map((c: Record<string, unknown>) => ({
    site_id: typeof c.shopperId === "string" ? c.shopperId : "00000000-0000-0000-0000-000000000000",
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

  const response = await fetch("https://api.admitad.com/statistics/actions/", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Admitad API failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return (data.results || []).map((c: Record<string, unknown>) => ({
    site_id: typeof c.subid === "string" ? c.subid : "00000000-0000-0000-0000-000000000000",
    order_id: String(c.id),
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

  const response = await fetch("https://api.partnerstack.com/api/v2/transactions", {
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PartnerStack API failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return (data.transactions || []).map((c: Record<string, unknown>) => ({
    site_id: typeof c.customer_key === "string" ? c.customer_key : "00000000-0000-0000-0000-000000000000",
    order_id: typeof c.key === "string" ? c.key : undefined,
    network: "partnerstack",
    commission_amount: typeof c.amount === "number" ? c.amount : 0,
    currency: typeof c.currency === "string" ? c.currency : undefined,
    status: typeof c.status === "string" ? c.status : undefined,
    event_date: typeof c.created_at === "string" ? c.created_at : new Date().toISOString(),
    raw_data: c,
  }));
}
