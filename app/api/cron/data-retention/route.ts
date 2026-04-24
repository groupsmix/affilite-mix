import { NextRequest, NextResponse } from "next/server";
import { getServiceClient } from "@/lib/supabase-server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";

/**
 * POST /api/cron/data-retention — GDPR Data Retention
 * Designed to be called daily via Cloudflare Cron Trigger.
 *
 * Purges old data to comply with GDPR Art. 5(1)(e):
 * - affiliate_clicks: older than 90 days
 * - audit_log: older than 365 days
 * - stripe_events: older than 30 days
 */
export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, { secretEnvVars: ["CRON_RETENTION_SECRET", "CRON_SECRET"] })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getServiceClient();
  const results: Record<string, { success: boolean; error?: string }> = {};
  const now = new Date();

  try {
    const clicksDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
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

  try {
    const auditDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const { error: auditError } = await sb
      .from("audit_log")
      .delete()
      .lt("created_at", auditDate.toISOString());

    if (auditError) throw auditError;
    results.audit_log = { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.audit_log = { success: false, error: msg };
    captureException(err, { context: "[cron/data-retention] audit_log failed:" });
  }

  try {
    const stripeDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
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
