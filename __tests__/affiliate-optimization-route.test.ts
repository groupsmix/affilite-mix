import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  listSites: vi.fn(),
  listAccounts: vi.fn(),
  createRun: vi.fn(),
  updateRun: vi.fn(),
  getData: vi.fn(),
  getAction: vi.fn(),
  recent: vi.fn(),
  pending: vi.fn(),
  guarded: vi.fn(),
  getExecutor: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({ verifyCronAuth: mocks.verifyCronAuth }));
vi.mock("@/lib/cron-liveness", () => ({ recordCronLiveness: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureException: mocks.capture }));
vi.mock("@/lib/dal/optimization-loop", () => ({
  listOptimizationSites: mocks.listSites,
  getOptimizationData: mocks.getData,
}));
vi.mock("@/lib/dal/automation-service-accounts", () => ({
  listAutomationServiceAccountsForSite: mocks.listAccounts,
}));
vi.mock("@/lib/dal/automation-runs", () => ({
  createAutomationRun: mocks.createRun,
  updateAutomationRun: mocks.updateRun,
}));
vi.mock("@/lib/dal/automation-actions", () => ({
  getActionByIdempotencyKey: mocks.getAction,
  hasRecentAutomationAction: mocks.recent,
  hasPendingAutomationAction: mocks.pending,
}));
vi.mock("@/lib/automation/guarded-mutation", () => ({
  runGuardedMutation: mocks.guarded,
}));
vi.mock("@/lib/automation/executors/registry", () => ({
  getExecutor: mocks.getExecutor,
}));
vi.mock("@/lib/automation/executors/products", () => ({
  assertProductTarget: vi.fn(),
}));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/cron/affiliate-optimization/route";

const account = {
  id: "account",
  site_id: "site",
  name: "optimizer",
  status: "active",
  scopes: ["products:update"],
  allowed_ip_ranges: null,
  max_actions_per_run: 10,
  max_actions_per_day: 20,
  created_by: "owner",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const product = {
  id: "product",
  site_id: "site",
  category_id: "category",
  affiliate_url: "https://a.example",
  featured: false,
  status: "active",
};

function request() {
  return new NextRequest("https://example.com/api/cron/affiliate-optimization", {
    method: "POST",
  });
}

function setupSite() {
  mocks.verifyCronAuth.mockReturnValue(true);
  mocks.listSites.mockResolvedValue([{ id: "site" }]);
  mocks.listAccounts.mockResolvedValue([account]);
  mocks.createRun.mockResolvedValue({ id: "run" });
  mocks.updateRun.mockResolvedValue({});
  mocks.getData.mockResolvedValue({
    products: [product],
    epc: [
      {
        product_id: "product",
        network: "network-a",
        clicks_30d: 200,
        commissions_30d: 0,
        epc_30d: 0,
        updated_at: new Date().toISOString(),
      },
    ],
    links: [],
    health: [],
    pageProducts: [],
    latestEpcAt: new Date().toISOString(),
  });
  mocks.getAction.mockResolvedValue(null);
  mocks.recent.mockResolvedValue(false);
  mocks.pending.mockResolvedValue(false);
  mocks.getExecutor.mockReturnValue({ execute: vi.fn() });
}

describe("affiliate optimization cron route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupSite();
  });

  it("rejects requests without the cron secret", async () => {
    mocks.verifyCronAuth.mockReturnValue(false);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.listSites).not.toHaveBeenCalled();
  });

  it("finalizes a stale-EPC run with a skip reason", async () => {
    mocks.getData.mockResolvedValue({
      ...(await mocks.getData()),
      latestEpcAt: "2020-01-01T00:00:00Z",
    });
    await POST(request());
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "site",
      "run",
      expect.objectContaining({
        status: "succeeded",
        summary: { skipped: true, reason: expect.stringContaining("older") },
      }),
    );
  });

  it("skips sites without a suitable service account and finalizes the run", async () => {
    mocks.listAccounts.mockResolvedValue([]);
    await POST(request());
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "site",
      "run",
      expect.objectContaining({
        status: "succeeded",
        summary: { skipped: true, reason: expect.stringContaining("service account") },
      }),
    );
  });

  it("records site failures and continues the sweep", async () => {
    mocks.listSites.mockResolvedValue([{ id: "failed" }, { id: "healthy" }]);
    mocks.createRun.mockImplementation(async ({ site_id }: { site_id: string }) => ({
      id: `run-${site_id}`,
    }));
    mocks.listAccounts.mockImplementation(async (siteId: string) => {
      if (siteId === "failed") throw new Error("site data unavailable");
      return [account];
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.capture).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ site_id: "failed", run_id: "run-failed" }),
    );
    expect(mocks.createRun).toHaveBeenCalledTimes(2);
  });

  it("suppresses cooldown and pending duplicate proposals", async () => {
    mocks.recent.mockResolvedValue(true);
    await POST(request());
    expect(mocks.guarded).not.toHaveBeenCalled();
    mocks.recent.mockResolvedValue(false);
    mocks.pending.mockResolvedValue(true);
    await POST(request());
    expect(mocks.guarded).not.toHaveBeenCalled();
  });

  it("records manual and successful action counters in the run summary", async () => {
    mocks.guarded.mockResolvedValue(new Response(null, { status: 202 }));
    mocks.getAction
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ run_id: "run", status: "manual_attention" });
    await POST(request());
    expect(mocks.updateRun).toHaveBeenCalledWith(
      "site",
      "run",
      expect.objectContaining({
        status: "succeeded",
        planned_actions: 1,
        succeeded_actions: 0,
        failed_actions: 0,
        manual_actions: 1,
      }),
    );
  });

  it("replays an existing deterministic action without invoking an executor", async () => {
    const execute = vi.fn();
    mocks.getExecutor.mockReturnValue({ execute });
    mocks.getAction.mockResolvedValue({
      id: "prior",
      run_id: "prior-run",
      status: "succeeded",
    });
    await POST(request());
    expect(mocks.guarded).toHaveBeenCalledOnce();
    expect(execute).not.toHaveBeenCalled();
  });
});
