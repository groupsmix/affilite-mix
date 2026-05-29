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
import { getAuditArchiveR2 } from "@/lib/runtime-env";

// A82-F1: Batch size for cursor-based processing to survive interruptions
const BATCH_SIZE = 5000;

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
  // A82-F1: Cursor-based batch processing so interrupted runs resume where they stopped.
  try {
    const clicksDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Load checkpoint cursor — resume from last processed ID
    const { data: checkpoint } = (await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client; gated by CRON_SECRET
      .from("cron_state")
      .select("job_name, last_id, last_processed_at, cursor, updated_at")
      // F-API-01: `cron_state` is a global job-progress table with no `site_id` column.
      .unsafeNoSiteFilter()
      .eq("job_name", "data-retention:clicks")
      .single()) as { data: { last_id?: string | null } | null };

    let totalDeleted = 0;
    let lastId = checkpoint?.last_id ?? "";
    let hasMore = true;

    while (hasMore) {
      // Fetch a batch of IDs to delete
      let query = sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("affiliate_clicks")
        .select("id")
        // F-API-01: cross-tenant retention sweep — cron is CRON_SECRET-gated
        // and intentionally purges expired rows across every site.
        .unsafeNoSiteFilter()
        .lt("created_at", clicksDate.toISOString())
        .order("id", { ascending: true })
        .limit(BATCH_SIZE);

      if (lastId) {
        query = query.gt("id", lastId);
      }

      const { data: batch, error: fetchErr } = await query;
      if (fetchErr) throw fetchErr;

      if (!batch || batch.length === 0) {
        hasMore = false;
        break;
      }

      const ids = batch.map((r: { id: string }) => r.id);
      const { error: delErr } = await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("affiliate_clicks")
        .delete()
        // F-API-01: ids were resolved cross-tenant in the previous fetch step.
        .unsafeNoSiteFilter()
        .in("id", ids);

      if (delErr) throw delErr;

      totalDeleted += ids.length;
      lastId = ids[ids.length - 1];

      // Persist checkpoint after each batch
      await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client; gated by CRON_SECRET
        .from("cron_state")
        // F-API-01: `cron_state` is a global job-progress table.
        .upsert(
          {
            job_name: "data-retention:clicks",
            last_id: lastId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_name" },
        )
        .unsafeNoSiteFilter();

      if (batch.length < BATCH_SIZE) hasMore = false;
    }

    // Clear checkpoint on successful completion
    await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client; gated by CRON_SECRET
      .from("cron_state")
      // F-API-01: global job-progress table.
      .upsert(
        {
          job_name: "data-retention:clicks",
          last_id: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "job_name" },
      )
      .unsafeNoSiteFilter();

    results.affiliate_clicks = { success: true, deleted: totalDeleted };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.affiliate_clicks = { success: false, error: msg };
    captureException(err, { context: "[cron/data-retention] affiliate_clicks failed:" });
  }

  // A162: Minimize IP data — null out ip_prefix and fingerprint after 30 days.
  // The full affiliate_click row is kept for commission reconciliation (up to 365d),
  // but the privacy-sensitive /24 prefix and dedup fingerprint are erased at 30d.
  try {
    const ipMinimizeDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const { error: ipMinErr } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client; gated by CRON_SECRET
      .from("affiliate_clicks")
      .update({ ip_prefix: null, fingerprint: null })
      // F-API-01: GDPR IP minimisation runs across every tenant.
      .unsafeNoSiteFilter()
      .lt("created_at", ipMinimizeDate.toISOString())
      .not("ip_prefix", "is", null);

    if (ipMinErr) throw ipMinErr;
    results.affiliate_clicks_ip_minimize = { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.affiliate_clicks_ip_minimize = { success: false, error: msg };
    captureException(err, {
      context: "[cron/data-retention] affiliate_clicks ip_prefix minimize failed:",
    });
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
    // @ts-expect-error ACCEPTED: purge_retention RPC exists (migration 00099) but generated types show Args: never — regenerate types after deploying migration to fix
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
      const { data: auditRows, error: fetchError } = (await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("audit_log")
        .select(
          "id, site_id, actor, actor_user_id, action, entity_type, entity_id, details, ip, created_at",
        )
        // F-API-01: cross-tenant audit-log retention sweep.
        .unsafeNoSiteFilter()
        .lt("created_at", auditDate.toISOString())
        .limit(10000)) as unknown as {
        data:
          | {
              id: string;
              site_id: string;
              actor: string;
              actor_user_id: string | null;
              action: string;
              entity_type: string;
              entity_id: string;
              details: Record<string, unknown> | null;
              ip: string | null;
              created_at: string;
            }[]
          | null;
        error: { message: string; code?: string } | null;
      };

      if (fetchError) throw fetchError;

      let archivedCount = 0;
      let archiveSucceeded = false;
      if (auditRows && auditRows.length > 0) {
        try {
          const r2 = getAuditArchiveR2();

          if (r2) {
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
          logger.error(
            "Failed to archive audit log to R2 — skipping deletion to prevent data loss",
            {
              error: archiveErr instanceof Error ? archiveErr.message : String(archiveErr),
            },
          );
          captureException(archiveErr, {
            context: "[cron/data-retention] audit_log R2 archive failed",
          });
        }
      }

      let deletedCount = 0;
      if (archiveSucceeded && auditRows && auditRows.length > 0) {
        const ids = auditRows.map((row) => row.id);
        const { error: auditError } = await sb
          // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
          .from("audit_log")
          .delete()
          // F-API-01: ids resolved cross-tenant above.
          .unsafeNoSiteFilter()
          .in("id", ids);

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
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
      .from("stripe_events")
      .delete()
      // F-API-01: `stripe_events` is a global webhook log (no site_id column).
      .unsafeNoSiteFilter()
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
