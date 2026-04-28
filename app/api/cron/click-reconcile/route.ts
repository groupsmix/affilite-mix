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
 * F-017: Reconciles click tracking by processing click_failures rows
 * and inserting them into affiliate_clicks. This ensures no lost clicks
 * from queue failures or DLQ messages.
 *
 * A-006: Also monitors failure rates and alerts if excessive.
 */
const RECONCILE_LOOKBACK_HOURS = 1;
const FAILURE_ALERT_THRESHOLD = 10;
const MAX_RECONCILE_BATCH = 100; // Process at most this many failures per run

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

    // F-017: Reconcile click_failures into affiliate_clicks
    let reconciled = 0;
    let reconcileErrors = 0;

    if (failures > 0) {
      // Fetch pending failures to reconcile
      const { data: pendingFailures, error: fetchError } = await sb
        .from("click_failures")
        .select("id, payload, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: true })
        .limit(MAX_RECONCILE_BATCH);

      if (fetchError) {
        logger.error("Failed to fetch pending click_failures", { error: fetchError.message });
      } else if (pendingFailures && pendingFailures.length > 0) {
        logger.info(`Processing ${pendingFailures.length} click_failures for reconciliation`);

        for (const failure of pendingFailures) {
          try {
            const payload = failure.payload as Record<string, unknown>;

            // Extract required fields from payload
            const site_id = payload.site_id as string;
            const product_name = payload.product_name as string;
            const affiliate_url = payload.affiliate_url as string;

            if (!site_id || !product_name || !affiliate_url) {
              logger.warn("Skipping click_failure with missing required fields", {
                id: failure.id,
                missing: {
                  site_id: !site_id,
                  product_name: !product_name,
                  affiliate_url: !affiliate_url,
                },
              });
              reconcileErrors++;
              continue;
            }

            // Insert into affiliate_clicks
            const { error: insertError } = await sb.from("affiliate_clicks").insert({
              site_id,
              product_name,
              affiliate_url,
              content_slug: (payload.content_slug as string) || null,
              referrer: (payload.referrer as string) || null,
              // created_at will default to now()
            });

            if (insertError) {
              logger.error("Failed to reconcile click_failure", {
                id: failure.id,
                error: insertError.message,
              });
              reconcileErrors++;
            } else {
              // Successfully reconciled - delete from click_failures
              const { error: deleteError } = await sb
                .from("click_failures")
                .delete()
                .eq("id", failure.id);

              if (deleteError) {
                logger.error("Failed to delete reconciled click_failure", {
                  id: failure.id,
                  error: deleteError.message,
                });
                // Still count as reconciled since the click was recorded
              }
              reconciled++;
            }
          } catch (reconcileErr) {
            const errMsg = reconcileErr instanceof Error ? reconcileErr.message : String(reconcileErr);
            logger.error("Exception reconciling click_failure", {
              id: failure.id,
              error: errMsg,
            });
            reconcileErrors++;
          }
        }
      }
    }

    logger.info("Click reconciliation complete", {
      lookbackHours: RECONCILE_LOOKBACK_HOURS,
      successes,
      failures,
      reconciled,
      reconcileErrors,
      lossRate: lossRate.toFixed(4),
    });

    void recordCronLiveness("click-reconcile");
    return NextResponse.json({
      ok: true,
      successes,
      failures,
      reconciled,
      reconcileErrors,
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
