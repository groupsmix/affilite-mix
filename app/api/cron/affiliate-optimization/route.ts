import { NextRequest, NextResponse } from "next/server";
import { getCronAuthOptionsForPath } from "@/lib/cron-registry";
import { verifyCronAuth } from "@/lib/cron-auth";
import { recordCronLiveness } from "@/lib/cron-liveness";
import { captureException } from "@/lib/sentry";
import { createAutomationRun, updateAutomationRun } from "@/lib/dal/automation-runs";
import {
  getActionByIdempotencyKey,
  hasPendingAutomationAction,
  hasRecentAutomationAction,
} from "@/lib/dal/automation-actions";
import { listAutomationServiceAccountsForSite } from "@/lib/dal/automation-service-accounts";
import { getOptimizationData, listOptimizationSites } from "@/lib/dal/optimization-loop";
import { getExecutor } from "@/lib/automation/executors/registry";
import { assertProductTarget } from "@/lib/automation/executors/products";
import { runGuardedMutation } from "@/lib/automation/guarded-mutation";
import { type AutomationAuthContext } from "@/lib/automation/auth";
import {
  chooseCandidates,
  chooseNetworkSwitch,
  deterministicOptimizationKey,
  isEpcFresh,
  OPTIMIZATION_COOLDOWN_DAYS,
  type ProductPerformance,
} from "@/lib/automation/optimization";

const GOAL =
  "Review 30-day EPC and affiliate destination health; propose or execute policy-approved product optimizations.";

function runDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function automationCronRequest(idempotencyKey: string): NextRequest {
  return new NextRequest("https://cron.internal/api/cron/affiliate-optimization", {
    method: "POST",
    headers: {
      "idempotency-key": idempotencyKey,
      "user-agent": "affiliate-optimization-cron",
      "x-automation-trigger": "scheduled",
    },
  });
}

function performanceRows(
  data: Awaited<ReturnType<typeof getOptimizationData>>,
): ProductPerformance[] {
  const pageByProduct = new Map<string, string>();
  for (const row of data.pageProducts) {
    if (!pageByProduct.has(row.product_id)) pageByProduct.set(row.product_id, row.content_id);
  }
  const byProduct = new Map(data.products.map((product) => [product.id, product]));
  const rows: ProductPerformance[] = [];
  for (const [productId, product] of byProduct) {
    for (const stat of data.epc.filter((row) => row.product_id === productId)) {
      rows.push({
        productId,
        siteId: product.site_id,
        categoryId: product.category_id,
        groupKey: pageByProduct.get(productId) ?? null,
        featured: product.featured,
        active: product.status === "active",
        clicks: stat.clicks_30d,
        commissions: stat.commissions_30d,
        epc: stat.epc_30d,
        network: stat.network,
      });
    }
  }
  return rows;
}

function networkSwitches(
  data: Awaited<ReturnType<typeof getOptimizationData>>,
  rows: ProductPerformance[],
): Map<string, { url: string; reason: string }> {
  const result = new Map<string, { url: string; reason: string }>();
  for (const productId of new Set(rows.map((row) => row.productId))) {
    const productRows = rows.filter((row) => row.productId === productId);
    const links = data.links.filter((link) => link.product_id === productId);
    if (links.length < 2) continue;
    const product = data.products.find((candidate) => candidate.id === productId);
    const decision = chooseNetworkSwitch(
      product?.affiliate_url ?? null,
      links,
      productRows,
      data.health.filter((health) => health.product_id === productId),
    );
    if (decision) result.set(productId, decision);
  }
  return result;
}

async function executeCandidate(
  request: NextRequest,
  auth: AutomationAuthContext,
  runId: string,
  runActionCount: number,
  candidate: ReturnType<typeof chooseCandidates>[number],
  key: string,
) {
  const executor = getExecutor(candidate.actionType);
  if (!executor) throw new Error(`No executor registered for ${candidate.actionType}`);
  return runGuardedMutation({
    request,
    requestId: key,
    auth,
    runId,
    runActionCount,
    actionType: candidate.actionType,
    targetType: "product",
    targetId: candidate.productId,
    payload: candidate.payload,
    replay: () => NextResponse.json({ replay: true }),
    validateTarget: () => assertProductTarget(auth.siteId, candidate.productId),
    execute: (action) => executor.execute(action, { siteId: auth.siteId }),
    success: (execution) => NextResponse.json(execution.result),
  });
}

export async function POST(request: NextRequest) {
  if (!verifyCronAuth(request, getCronAuthOptionsForPath("/api/cron/affiliate-optimization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const since = new Date(
    now.getTime() - OPTIMIZATION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const totals = { sites: 0, skipped: 0, actions: 0, succeeded: 0, failed: 0, manual: 0 };
  try {
    const sites = await listOptimizationSites();
    for (const site of sites) {
      totals.sites++;
      const run = await createAutomationRun({
        service_account_id: null,
        site_id: site.id,
        trigger: "scheduled",
        goal: GOAL,
      });
      const finishSkipped = async (reason: string) => {
        totals.skipped++;
        await updateAutomationRun(site.id, run.id, {
          status: "succeeded",
          finished_at: new Date().toISOString(),
          summary: { skipped: true, reason },
        });
      };
      try {
        const accounts = await listAutomationServiceAccountsForSite(site.id);
        const account = [...accounts]
          .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
          .find(
            (candidate) =>
              candidate.status === "active" && candidate.scopes.includes("products:update"),
          );
        if (!account) {
          await finishSkipped("No active service account with products:update scope");
          continue;
        }
        await updateAutomationRun(site.id, run.id, { service_account_id: account.id });
        const data = await getOptimizationData(site.id);
        if (!isEpcFresh(data.latestEpcAt, now.getTime())) {
          await finishSkipped("EPC aggregates are missing or older than 48 hours");
          continue;
        }
        const rows = performanceRows(data);
        const candidates = chooseCandidates(rows, networkSwitches(data, rows));
        let runActionCount = 0;
        let runSucceeded = 0;
        let runFailed = 0;
        let runManual = 0;
        for (const candidate of candidates) {
          const key = deterministicOptimizationKey(
            runDate(now),
            candidate.productId,
            candidate.actionType,
          );
          const existing = await getActionByIdempotencyKey(account.id, key);
          const suppressed =
            !existing &&
            ((await hasRecentAutomationAction(
              site.id,
              candidate.productId,
              candidate.actionType,
              since,
            )) ||
              (await hasPendingAutomationAction(
                site.id,
                candidate.productId,
                candidate.actionType,
              )));
          if (suppressed) {
            continue;
          }
          await executeCandidate(
            automationCronRequest(key),
            {
              account,
              siteId: site.id,
              scopes: account.scopes,
            },
            run.id,
            runActionCount,
            candidate,
            key,
          );
          const action = await getActionByIdempotencyKey(account.id, key);
          if (action?.run_id !== run.id) continue;
          runActionCount++;
          totals.actions++;
          if (action.status === "succeeded") {
            totals.succeeded++;
            runSucceeded++;
          } else if (action.status === "manual_attention") {
            totals.manual++;
            runManual++;
          } else {
            totals.failed++;
            runFailed++;
          }
        }
        await updateAutomationRun(site.id, run.id, {
          status: runFailed > 0 ? "partial" : "succeeded",
          planned_actions: runActionCount,
          succeeded_actions: runSucceeded,
          failed_actions: runFailed,
          manual_actions: runManual,
          finished_at: new Date().toISOString(),
          summary: { candidate_count: candidates.length, cooldown_since: since },
        });
      } catch (error) {
        totals.failed++;
        captureException(error, {
          context: "[cron/affiliate-optimization] site failed",
          site_id: site.id,
          run_id: run.id,
        });
        await updateAutomationRun(site.id, run.id, {
          status: "failed",
          finished_at: new Date().toISOString(),
          error_code: "OPTIMIZATION_RUN_FAILED",
          summary: { error: error instanceof Error ? error.message : String(error) },
        });
        continue;
      }
    }
    void recordCronLiveness("affiliate-optimization");
    return NextResponse.json(totals);
  } catch (error) {
    captureException(error, { context: "[cron/affiliate-optimization] failed" });
    return NextResponse.json({ error: "Affiliate optimization failed" }, { status: 500 });
  }
}
