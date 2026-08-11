import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("@/lib/dal/automation-actions", () => ({
  getActionByIdempotencyKey: vi.fn(),
  createAutomationAction: vi.fn(),
  updateAutomationAction: vi.fn(),
}));
vi.mock("@/lib/dal/automation-policies", () => ({ getPolicyForAction: vi.fn() }));
vi.mock("@/lib/dal/automation-runs", () => ({ countActionsSince: vi.fn() }));

import { runGuardedMutation } from "@/lib/automation/guarded-mutation";
import {
  getActionByIdempotencyKey,
  createAutomationAction,
  updateAutomationAction,
} from "@/lib/dal/automation-actions";
import { getPolicyForAction } from "@/lib/dal/automation-policies";
import { countActionsSince } from "@/lib/dal/automation-runs";

const getAction = getActionByIdempotencyKey as unknown as ReturnType<typeof vi.fn>;
const createAction = createAutomationAction as unknown as ReturnType<typeof vi.fn>;
const updateAction = updateAutomationAction as unknown as ReturnType<typeof vi.fn>;
const policy = getPolicyForAction as unknown as ReturnType<typeof vi.fn>;
const count = countActionsSince as unknown as ReturnType<typeof vi.fn>;

const auth = {
  token: { id: "token-1" },
  account: {
    id: "account-1",
    scopes: ["products:update"],
    max_actions_per_day: 20,
    max_actions_per_run: 5,
  },
  siteId: "site-1",
  scopes: ["products:update"],
};
const requestId = "request-1";
const key = "11111111-1111-1111-1111-111111111111";

function request(headers: Record<string, string> = {}) {
  return new NextRequest("https://example.test/automation", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  policy.mockResolvedValue(null);
  count.mockResolvedValue(0);
  getAction.mockResolvedValue(null);
  createAction.mockImplementation((input: Record<string, unknown>) => ({
    id: "action-1",
    ...input,
  }));
  updateAction.mockResolvedValue({});
});

describe("runGuardedMutation", () => {
  it("preserves required-key validation, replay, and conflict behavior", async () => {
    const base = {
      requestId,
      auth: auth as never,
      actionType: "products.update" as const,
      targetType: "product",
      targetId: "product-1",
      payload: { product_id: "product-1", updates: { name: "New" } },
      replay: (action: { id: string }) => NextResponse.json({ replayed: action.id }),
      execute: vi.fn().mockResolvedValue({ result: { product_id: "product-1" } }),
      success: () => NextResponse.json({ ok: true }),
    };
    expect((await runGuardedMutation({ ...base, request: request() })).status).toBe(400);
    expect(
      (await runGuardedMutation({ ...base, request: request({ "idempotency-key": "short" }) }))
        .status,
    ).toBe(400);

    getAction.mockResolvedValueOnce({
      id: "prior",
      payload_hash: await (await import("@/lib/automation/idempotency")).payloadHash(base.payload),
    });
    const replay = await runGuardedMutation({
      ...base,
      request: request({ "idempotency-key": key }),
    });
    expect(replay.status).toBe(200);
    expect(base.execute).not.toHaveBeenCalled();

    getAction.mockResolvedValueOnce({ id: "prior", payload_hash: "different" });
    expect(
      (await runGuardedMutation({ ...base, request: request({ "idempotency-key": key }) })).status,
    ).toBe(409);
  });

  it("records approval without executing and records snapshots on allow", async () => {
    const execute = vi.fn().mockResolvedValue({
      result: { product_id: "product-1" },
      beforeSnapshot: { status: "draft" },
      afterSnapshot: { status: "active" },
    });
    const base = {
      request: request({ "idempotency-key": key }),
      requestId,
      auth: auth as never,
      actionType: "products.update" as const,
      targetType: "product",
      targetId: "product-1",
      payload: { product_id: "product-1", updates: { name: "New" } },
      replay: () => NextResponse.json({ replay: true }),
      execute,
      success: (_result: unknown, action: { id: string }) => NextResponse.json({ id: action.id }),
    };

    const response = await runGuardedMutation(base);
    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledOnce();
    expect(updateAction).toHaveBeenCalledWith(
      "site-1",
      "action-1",
      expect.objectContaining({
        before_snapshot: { status: "draft" },
        after_snapshot: { status: "active" },
      }),
    );

    policy.mockResolvedValueOnce({ mode: "approval_required", constraints: {}, is_active: true });
    const approval = await runGuardedMutation({ ...base, execute: vi.fn() });
    expect(approval.status).toBe(202);
    expect(createAction).toHaveBeenCalledWith(
      expect.objectContaining({ status: "manual_attention" }),
    );
  });
});
