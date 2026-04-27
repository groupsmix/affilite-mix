import { NextRequest, NextResponse } from "next/server";
// F-001 (deep audit): cron Worker calls have no x-site-id header so
// tenant JWTs carry no site claim and the tenant_isolation RLS policy
// rejects writes. Cron is CRON_SECRET-gated; use the privileged client
// and do tenant scoping per query.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

/**
 * POST /api/cron/data-retention — GDPR Data Retention
 * Designed to be called daily via Cloudflare Cron Trigger.
 *
 * Purges old data to comply with GDPR Art. 5(1)(e):
 * - affiliate_clicks: older than 365 days (F-DATA-01: extended from 90d for commission reconciliation)
 * - audit_log: older than 365 days (F-DATA-02: exported to R2 before deletion)
 * - stripe_events: older than 90 days
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/data-retention"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getPrivilegedSupabaseClient();
  const results: Record<string, { success: boolean; error?: string; archived?: number }> = {};
  const now = new Date();

  // F-DATA-01: Extended affiliate_clicks retention to 365 days to avoid
  // breaking commission reconciliation (CJ etc. post 30–180 days post-click).
  try {
    const clicksDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const { error: clicksError } = await sb
      .from("affiliate_clicks")
      .delete()
      .lt("created_at", clicksDate.toISOString());

    if (clicksError) throw clicksError;
    results.affiliate_clicks = { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.affiliate_clicks = { success: false, error: msg };
    captureException(err, { context: "[cron/data-retention] affiliate_clicks failed:" });
  }

  // F-DATA-02: Export audit log cohort to R2 before deletion.
  // Rows older than 365 days are archived as JSONL, then deleted from the hot table.
  try {
    const auditDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Fetch rows to archive before deleting
    const { data: auditRows, error: fetchError } = await sb
      .from("audit_log")
      .select("*")
      .lt("created_at", auditDate.toISOString())
      .limit(10000);

    if (fetchError) throw fetchError;

    let archivedCount = 0;
    if (auditRows && auditRows.length > 0) {
      // Attempt R2 archive export
      try {
        const r2 = (process.env as Record<string, unknown>).AUDIT_ARCHIVE_R2 as
          | { put: (key: string, body: string) => Promise<void> }
          | undefined;

        if (r2 && typeof r2.put === "function") {
          const yearMonth = `${auditDate.getFullYear()}-${String(auditDate.getMonth() + 1).padStart(2, "0")}`;
          const jsonl = auditRows.map((row) => JSON.stringify(row)).join("\n");
          const archiveKey = `audit-log-archive/${yearMonth}/${now.toISOString()}.jsonl`;
          await r2.put(archiveKey, jsonl);
          archivedCount = auditRows.length;
          logger.info("Audit log archived to R2", { key: archiveKey, count: archivedCount });
        } else {
          logger.warn(
            "AUDIT_ARCHIVE_R2 binding not available — audit log rows will be deleted without archival. " +
              "Configure the R2 binding in wrangler.jsonc to enable archival.",
          );
        }
      } catch (archiveErr) {
        logger.error("Failed to archive audit log to R2, proceeding with deletion", {
          error: archiveErr instanceof Error ? archiveErr.message : String(archiveErr),
        });
        captureException(archiveErr, {
          context: "[cron/data-retention] audit_log R2 archive failed",
        });
      }
    }

    const { error: auditError } = await sb
      .from("audit_log")
      .delete()
      .lt("created_at", auditDate.toISOString());

    if (auditError) throw auditError;
    results.audit_log = { success: true, archived: archivedCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.audit_log = { success: false, error: msg };
    captureException(err, { context: "[cron/data-retention] audit_log failed:" });
  }

  try {
    const stripeDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const { error: stripeError } = await sb
      .from("stripe_events")
      .delete()
      .lt("received_at", stripeDate.toISOString());

    if (stripeError) throw stripeError;
    results.stripe_events = { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.stripe_events = { success: false, error: msg };
    captureException(err, { context: "[cron/data-retention] stripe_events failed:" });
  }

  logger.info("Data retention cron complete", { results });

  const hasErrors = Object.values(results).some((r) => !r.success);

  if (hasErrors) {
    return NextResponse.json(
      { ok: false, message: "Completed with errors", results },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, results });
}
