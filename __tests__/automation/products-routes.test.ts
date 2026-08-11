import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/automation/auth", () => ({ authenticateAutomationRequest: vi.fn() }));
vi.mock("@/lib/dal/automation-actions", () => ({
  getActionByIdempotencyKey: vi.fn(),
  createAutomationAction: vi.fn(),
  updateAutomationAction: vi.fn(),
}));
vi.mock("@/lib/dal/automation-policies", () => ({ getPolicyForAction: vi.fn() }));
vi.mock("@/lib/dal/automation-runs", () => ({ countActionsSince: vi.fn() }));
vi.mock("@/lib/automation/executors/registry", () => ({ getExecutor: vi.fn() }));
vi.mock("@/lib/automation/executors/products", () => ({
  assertProductTarget: vi.fn().mockResolvedValue(undefined),
  mapProductExecutorError: (error: unknown) => ({
    code:
      (error as Error & { status?: number }).status === 404
        ? "AUTOMATION_NOT_FOUND"
        : "AUTOMATION_INTERNAL_ERROR",
    message: error instanceof Error ? error.message : "failed",
  }),
  validateProductAffiliateDestination: () => null,
}));

import { authenticateAutomationRequest } from "@/lib/automation/auth";
import {
  getActionByIdempotencyKey,
  createAutomationAction,
  updateAutomationAction,
} from "@/lib/dal/automation-actions";
import { getPolicyForAction } from "@/lib/dal/automation-policies";
import { countActionsSince } from "@/lib/dal/automation-runs";
import { getExecutor } from "@/lib/automation/executors/registry";
import { PATCH as updateProduct } from "@/app/api/automation/v1/products/[id]/route";
import { POST as updateAffiliateUrl } from "@/app/api/automation/v1/products/[id]/affiliate-url/route";
import { POST as activateProduct } from "@/app/api/automation/v1/products/[id]/activate/route";
import { POST as archiveProduct } from "@/app/api/automation/v1/products/[id]/archive/route";

const auth = authenticateAutomationRequest as unknown as ReturnType<typeof vi.fn>;
const getAction = getActionByIdempotencyKey as unknown as ReturnType<typeof vi.fn>;
const createAction = createAutomationAction as unknown as ReturnType<typeof vi.fn>;
const updateAction = updateAutomationAction as unknown as ReturnType<typeof vi.fn>;
const policy = getPolicyForAction as unknown as ReturnType<typeof vi.fn>;
const count = countActionsSince as unknown as ReturnType<typeof vi.fn>;
const executorFor = getExecutor as unknown as ReturnType<typeof vi.fn>;
const id = "11111111-1111-1111-1111-111111111111";
const key = "11111111-1111-1111-1111-111111111111";
const context = { params: Promise.resolve({ id }) };

function req(path: string, body: unknown, withKey = true, requestKey = key) {
  return new NextRequest(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(withKey ? { "idempotency-key": requestKey } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    ok: true,
    context: {
      token: { id: "token-1" },
      account: {
        id: "account-1",
        scopes: ["products:update", "products:activate"],
        max_actions_per_day: 100,
        max_actions_per_run: 20,
      },
      siteId: "site-1",
      scopes: ["products:update", "products:activate"],
    },
  });
  getAction.mockResolvedValue(null);
  policy.mockResolvedValue(null);
  count.mockResolvedValue(0);
  createAction.mockImplementation((input: Record<string, unknown>) => ({
    id: "action-1",
    ...input,
  }));
  updateAction.mockResolvedValue({});
  executorFor.mockReturnValue({
    execute: vi.fn().mockResolvedValue({
      result: { product_id: id, status: "active" },
      beforeSnapshot: { id, status: "draft" },
      afterSnapshot: { id, status: "active" },
    }),
  });
});

describe("automation product routes", () => {
  it("requires the action scope before idempotency or policy work", async () => {
    auth.mockResolvedValueOnce({
      ok: true,
      context: {
        token: { id: "token-1" },
        account: { id: "account-1", scopes: [], max_actions_per_day: 100, max_actions_per_run: 20 },
        siteId: "site-1",
        scopes: [],
      },
    });
    const response = await updateProduct(req(`/products/${id}`, { name: "New" }), context);
    expect(response.status).toBe(403);
    expect(getAction).not.toHaveBeenCalled();
  });

  it("requires a well-formed idempotency key for each action", async () => {
    const response = await updateProduct(req(`/products/${id}`, { name: "New" }, false), context);
    expect(response.status).toBe(400);
    expect(createAction).not.toHaveBeenCalled();
  });

  it("executes and records snapshots for all four registered product actions", async () => {
    expect(
      (await updateProduct(req(`/products/${id}`, { name: "New" }, true, `${key}-update`), context))
        .status,
    ).toBe(200);
    expect(
      (
        await updateAffiliateUrl(
          req(
            `/products/${id}/affiliate-url`,
            { affiliate_url: "https://amazon.com/item" },
            true,
            `${key}-url`,
          ),
          context,
        )
      ).status,
    ).toBe(202);
    expect(
      (await activateProduct(req(`/products/${id}/activate`, {}, true, `${key}-activate`), context))
        .status,
    ).toBe(202);
    expect((await archiveProduct(req(`/products/${id}/archive`, {}), context)).status).toBe(202);
    expect(executorFor).toHaveBeenCalledWith("products.update");
    expect(executorFor).toHaveBeenCalledWith("products.update_affiliate_url");
    expect(executorFor).toHaveBeenCalledWith("products.activate");
    expect(executorFor).toHaveBeenCalledWith("products.archive");
    expect(updateAction).toHaveBeenCalledWith(
      "site-1",
      "action-1",
      expect.objectContaining({
        before_snapshot: { id, status: "draft" },
        after_snapshot: { id, status: "active" },
      }),
    );
  });

  it("replays and conflicts without executing again", async () => {
    const response1 = await updateProduct(req(`/products/${id}`, { name: "New" }), context);
    expect(response1.status).toBe(200);
    getAction.mockResolvedValueOnce({ id: "prior", payload_hash: "different" });
    expect((await updateProduct(req(`/products/${id}`, { name: "Other" }), context)).status).toBe(
      409,
    );
    expect(executorFor).toHaveBeenCalledTimes(2);
    expect(createAction).toHaveBeenCalledOnce();
  });

  it("records approval-required lifecycle actions without executing", async () => {
    policy.mockResolvedValueOnce({ mode: "approval_required", constraints: {}, is_active: true });
    const response = await activateProduct(req(`/products/${id}/activate`, {}), context);
    expect(response.status).toBe(202);
    expect(createAction).toHaveBeenCalledWith(
      expect.objectContaining({ status: "manual_attention" }),
    );
    expect(executorFor).toHaveBeenCalledWith("products.activate");
  });

  it("maps a tenant-scoped missing product to AUTOMATION_NOT_FOUND", async () => {
    executorFor.mockReturnValueOnce({
      execute: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("Product not found"), { status: 404 })),
    });
    const response = await updateProduct(req(`/products/${id}`, { name: "New" }), context);
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("AUTOMATION_NOT_FOUND");
  });
});
