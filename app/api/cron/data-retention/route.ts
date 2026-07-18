import { NextRequest, NextResponse } from "next/server";
// F-001 (deep audit): cron Worker calls have no x-site-id header so
// tenant JWTs carry no site claim and the tenant_isolation RLS policy
// rejects writes. Cron is CRON_SECRET-gated; use the privileged client
// and do tenant scoping per query.
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role"; // nosemgrep: service-role-import
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

  // FIX-11 (F-016) + audit #9: Archive-first audit_log retention.
  //
  // This deliberately does NOT go through a SQL function. Archiving must land in
  // R2 (object storage) *before* any row is deleted, and a SECURITY DEFINER SQL
  // function cannot write to R2 — so the route owns the durable sequence:
  //   fetch expired rows → archive to R2 → delete only what was archived.
  //
  // Issue 7: Use cursor-based batching (matching the affiliate_clicks block)
  // so runs with >BATCH_SIZE expired rows eventually process all of them.
  // The checkpoint is keyed "data-retention:audit-log" in cron_state.
  try {
    const auditDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    // Load checkpoint cursor — resume from last processed ID.
    const { data: auditCheckpoint } = (await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client; gated by CRON_SECRET
      .from("cron_state")
      .select("job_name, last_id, last_processed_at, cursor, updated_at")
      .unsafeNoSiteFilter()
      .eq("job_name", "data-retention:audit-log")
      .single()) as { data: { last_id?: string | null } | null };

    let auditLastId = auditCheckpoint?.last_id ?? "";
    let auditHasMore = true;
    let totalAuditArchived = 0;
    let totalAuditDeleted = 0;

    while (auditHasMore) {
      // Fetch a batch of rows to archive before deleting.
      let auditQuery = sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("audit_log")
        .select(
          "id, site_id, actor, actor_user_id, action, entity_type, entity_id, details, ip, created_at",
        )
        .unsafeNoSiteFilter()
        .lt("created_at", auditDate.toISOString())
        .order("id", { ascending: true })
        .limit(BATCH_SIZE);

      if (auditLastId) {
        auditQuery = auditQuery.gt("id", auditLastId);
      }

      const { data: auditRows, error: fetchError } = (await auditQuery) as unknown as {
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

      if (!auditRows || auditRows.length === 0) {
        break;
      }

      const r2 = getAuditArchiveR2();

      if (!r2) {
        // R2 unbound — refuse to delete (no silent data loss) and alert loudly.
        const msg =
          "AUDIT_ARCHIVE_R2 unbound — audit_log retention is NOT being enforced. " +
          "Bind the R2 bucket; expired rows are retried each run until then.";
        logger.error(msg, { pending_rows: auditRows.length });
        captureException(new Error(msg), {
          context: "[cron/data-retention] audit_log retention skipped — R2 unbound",
          extra: { pending_rows: auditRows.length },
        });
        const hardFail = process.env.AUDIT_ARCHIVE_R2_REQUIRED === "1";
        results.audit_log = {
          success: !hardFail,
          error: hardFail ? msg : undefined,
          archived: totalAuditArchived,
          deleted: totalAuditDeleted,
        };
        break;
      }

      // Archive first.
      const yearMonth = `${auditDate.getFullYear()}-${String(auditDate.getMonth() + 1).padStart(2, "0")}`;
      const jsonl = auditRows.map((row) => JSON.stringify(row)).join("\n");
      const archiveKey = `audit-log-archive/${yearMonth}/${now.toISOString()}-${auditLastId || "start"}.jsonl`;
      await r2.put(archiveKey, jsonl);
      logger.info("Audit log batch archived to R2", { key: archiveKey, count: auditRows.length });

      // Delete only what we archived.
      const ids = auditRows.map((row) => row.id);
      const { error: auditError } = await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client (no site header); gated by CRON_SECRET
        .from("audit_log")
        .delete()
        .unsafeNoSiteFilter()
        .in("id", ids);

      if (auditError) throw auditError;

      totalAuditArchived += ids.length;
      totalAuditDeleted += ids.length;
      auditLastId = ids[ids.length - 1]!;

      // Persist checkpoint after each batch so interrupted runs resume.
      await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client; gated by CRON_SECRET
        .from("cron_state")
        .upsert(
          {
            job_name: "data-retention:audit-log",
            last_id: auditLastId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_name" },
        )
        .unsafeNoSiteFilter();

      if (auditRows.length < BATCH_SIZE) auditHasMore = false;
    }

    if (!results.audit_log) {
      // Clear checkpoint on successful completion of all batches.
      await sb
        // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client; gated by CRON_SECRET
        .from("cron_state")
        .upsert(
          {
            job_name: "data-retention:audit-log",
            last_id: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "job_name" },
        )
        .unsafeNoSiteFilter();

      results.audit_log = {
        success: true,
        archived: totalAuditArchived,
        deleted: totalAuditDeleted,
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

  // A70-F2: Purge web_vitals older than 90 days (matches privacy policy).
  try {
    const vitalsDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const { error: vitalsError } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client; gated by CRON_SECRET
      .from("web_vitals")
      .delete()
      // F-API-01: cross-tenant web_vitals retention sweep.
      .unsafeNoSiteFilter()
      .lt("created_at", vitalsDate.toISOString());

    if (vitalsError) throw vitalsError;
    results.web_vitals = { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.web_vitals = { success: false, error: msg };
    captureException(err, { context: "[cron/data-retention] web_vitals failed:" });
  }

  // A61-F1: Purge consent_log older than 7 years (retain as long as needed
  // to demonstrate lawful basis per GDPR Art. 7(1), capped at statute of
  // limitations ceiling).
  try {
    const consentDate = new Date(now.getTime() - 7 * 365 * 24 * 60 * 60 * 1000);
    const { error: consentError } = await sb
      // eslint-disable-next-line no-restricted-syntax -- Audited: cron uses privileged client; gated by CRON_SECRET
      .from("consent_log")
      .delete()
      // F-API-01: cross-tenant consent_log retention sweep.
      .unsafeNoSiteFilter()
      .lt("created_at", consentDate.toISOString());

    if (consentError) throw consentError;
    results.consent_log = { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.consent_log = { success: false, error: msg };
    captureException(err, { context: "[cron/data-retention] consent_log failed:" });
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
