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
import { recordCronLiveness } from "@/lib/cron-liveness";

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
  const results: Record<
    string,
    { success: boolean; error?: string; archived?: number; deleted?: number }
  > = {};
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

  // FIX-11 (F-016): Transactional audit_log purge via Postgres RPC.
  // The previous fetch→archive→delete was non-transactional: if the delete
  // failed after a successful R2 archive, rows were lost without a hot-table
  // record. The `purge_retention` SECURITY DEFINER function does the
  // archive + delete inside a single transaction, returning the count of
  // archived/deleted rows. If the function doesn't exist yet (pre-migration),
  // fall back to the old fetch→archive→delete path.
  try {
    const auditDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Try the transactional RPC first
    // @ts-ignore - The RPC is defined in migration but not yet generated in the local types
    const { data: rpcResult, error: rpcError } = await sb.rpc("purge_retention", {
      p_table: "audit_log",
      p_cutoff: auditDate.toISOString(),
      p_batch_limit: 10000,
    });

    if (rpcError) {
      // RPC not yet migrated — fall back to the old non-transactional path
      logger.warn("purge_retention RPC not available, falling back to fetch→archive→delete", {
        error: rpcError.message,
      });

      // Fetch rows to archive before deleting
      const { data: auditRows, error: fetchError } = await sb
        .from("audit_log")
        .select("*")
        .lt("created_at", auditDate.toISOString())
        .limit(10000);

      if (fetchError) throw fetchError;

      let archivedCount = 0;
      let archiveSucceeded = false;
      if (auditRows && auditRows.length > 0) {
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
            archiveSucceeded = true;
            logger.info("Audit log archived to R2", { key: archiveKey, count: archivedCount });
          } else {
            logger.warn(
              "AUDIT_ARCHIVE_R2 binding not available — skipping audit log deletion until R2 is configured. " +
                "Rows will be retried on the next cron run.",
            );
          }
        } catch (archiveErr) {
          logger.error("Failed to archive audit log to R2 — skipping deletion to prevent data loss", {
            error: archiveErr instanceof Error ? archiveErr.message : String(archiveErr),
          });
          captureException(archiveErr, {
            context: "[cron/data-retention] audit_log R2 archive failed",
          });
        }
      }

      let deletedCount = 0;
      if (archiveSucceeded && auditRows && auditRows.length > 0) {
        const ids = auditRows.map((row) => row.id);
        const { error: auditError } = await sb.from("audit_log").delete().in("id", ids);

        if (auditError) throw auditError;
        deletedCount = ids.length;
      }
      results.audit_log = { success: true, archived: archivedCount, deleted: deletedCount };
    } else {
      // Transactional RPC succeeded
      const result = rpcResult as { archived: number; deleted: number } | null;
      results.audit_log = {
        success: true,
        archived: result?.archived ?? 0,
        deleted: result?.deleted ?? 0,
      };
    }
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

  void recordCronLiveness("data-retention");
  return NextResponse.json({ ok: true, results });
}
