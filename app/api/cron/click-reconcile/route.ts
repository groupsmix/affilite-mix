import { NextRequest, NextResponse } from "next/server";
import { getPrivilegedSupabaseClient } from "@/lib/server-only/service-role";
import { verifyCronAuth } from "@/lib/cron-auth";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { captureException } from "@/lib/sentry";
import { logger } from "@/lib/logger";
import { recordCronLiveness } from "@/lib/cron-liveness";

/**
 * GET /api/cron/click-reconcile
 *
 * A-006: Reconciles click tracking volume by comparing recent
 * affiliate_clicks inserts with click_failures rows. If the failure
 * count exceeds a threshold in the lookback window, an alert is fired.
 */
const RECONCILE_LOOKBACK_HOURS = 1;
const FAILURE_ALERT_THRESHOLD = 10;

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/click-reconcile"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getPrivilegedSupabaseClient();
  const since = new Date(Date.now() - RECONCILE_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  try {
    // Count successful clicks in window
    const { count: successCount, error: successErr } = await sb
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);

    if (successErr) throw successErr;

    // Count failures in window
    const { count: failureCount, error: failureErr } = await sb
      .from("click_failures")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);

    if (failureErr) throw failureErr;

    const successes = successCount ?? 0;
    const failures = failureCount ?? 0;
    const total = successes + failures;
    const lossRate = total > 0 ? failures / total : 0;

    logger.info("Click reconciliation complete", {
      lookbackHours: RECONCILE_LOOKBACK_HOURS,
      successes,
      failures,
      lossRate: lossRate.toFixed(4),
    });

    // Alarm if absolute failures exceed threshold or loss rate is high (> 5%)
    if (failures >= FAILURE_ALERT_THRESHOLD || (total > 100 && lossRate > 0.05)) {
      const msg = `Click loss alarm: ${failures} failures in last ${RECONCILE_LOOKBACK_HOURS}h (loss rate ${(lossRate * 100).toFixed(1)}%)`;
      captureException(new Error(msg), {
        context: "[api/cron/click-reconcile] alarm",
        extra: { successes, failures, lossRate, since },
      });
      logger.error(msg);
    }

    void recordCronLiveness("click-reconcile");
    return NextResponse.json({
      ok: true,
      total,
      failures,
      lossRate,
      alarmed: failures >= FAILURE_ALERT_THRESHOLD || (total > 100 && lossRate > 0.05),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    captureException(err, { context: "[api/cron/click-reconcile] failed" });
    logger.error("Click reconciliation failed", { error: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
