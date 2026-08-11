import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: vi.fn(),
  assertRole: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/auth", () => ({ COOKIE_NAME: "__Host-nh_admin_token" }));
vi.mock("@/lib/dal/automation-actions", () => ({
  getAutomationActionById: vi.fn(),
  listAutomationActionsForSite: vi.fn(),
  updateAutomationAction: vi.fn(),
}));
vi.mock("@/lib/automation/executors/registry", () => ({ getExecutor: vi.fn() }));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn() }));

import { requireAdmin } from "@/lib/admin-guard";
import {
  getAutomationActionById,
  listAutomationActionsForSite,
  updateAutomationAction,
} from "@/lib/dal/automation-actions";
import { getExecutor } from "@/lib/automation/executors/registry";
import { recordAuditEvent } from "@/lib/audit-log";
import { GET as listActions } from "@/app/api/admin/automation/actions/route";
import { POST as approveAction } from "@/app/api/admin/automation/actions/[id]/approve/route";
import { POST as rejectAction } from "@/app/api/admin/automation/actions/[id]/reject/route";
import { POST as rollbackAction } from "@/app/api/admin/automation/actions/[id]/rollback/route";

const requireAdminMock = requireAdmin as unknown as ReturnType<typeof vi.fn>;
const getActionMock = getAutomationActionById as unknown as ReturnType<typeof vi.fn>;
const listMock = listAutomationActionsForSite as unknown as ReturnType<typeof vi.fn>;
const updateMock = updateAutomationAction as unknown as ReturnType<typeof vi.fn>;
const executorMock = getExecutor as unknown as ReturnType<typeof vi.fn>;
const auditMock = recordAuditEvent as unknown as ReturnType<typeof vi.fn>;

const siteId = "site-1";
const actionId = "action-1";
const admin = { userId: "admin-1", email: "owner@example.com", role: "admin" };

function action(status: string = "manual_attention") {
  return {
    id: actionId,
    site_id: siteId,
    service_account_id: "account-1",
    action_type: "products.update",
    status,
    payload: { product_id: "11111111-1111-1111-1111-111111111111", updates: { name: "New" } },
    target_id: "product-1",
    before_snapshot: { name: "Old", status: "draft" },
    after_snapshot: { name: "New", status: "draft" },
    result: { product_id: "product-1" },
    approved_by: null,
    approved_at: null,
  };
}

function request(path: string, body?: unknown, cookie = true) {
  return new NextRequest(`https://example.test${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie: "__Host-nh_admin_token=session" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ id: actionId }) };

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminMock.mockResolvedValue({
    error: null,
    session: admin,
    dbSiteId: siteId,
    siteSlug: "site-1",
    caller: { type: "interactive" },
  });
  getActionMock.mockResolvedValue(action());
  listMock.mockResolvedValue([action()]);
  updateMock.mockImplementation((_site: string, _id: string, patch: Record<string, unknown>) => ({
    ...action(String(patch.status ?? "running")),
    ...patch,
  }));
  executorMock.mockReturnValue({
    execute: vi.fn().mockResolvedValue({
      result: { product_id: "product-1" },
      beforeSnapshot: { name: "Old" },
      afterSnapshot: { name: "New" },
    }),
    rollback: vi.fn().mockResolvedValue({ product_id: "product-1", restored: true }),
  });
});

describe("owner automation approval plane", () => {
  it("approves and executes with owner metadata and audit", async () => {
    const response = await approveAction(request(`/actions/${actionId}/approve`), context);
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      siteId,
      actionId,
      expect.objectContaining({ status: "approved", approved_by: "admin-1" }),
      undefined,
      "manual_attention",
    );
    expect(updateMock).toHaveBeenCalledWith(
      siteId,
      actionId,
      expect.objectContaining({ status: "succeeded" }),
      undefined,
      "running",
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation.action.approved",
        entity_id: actionId,
        details: { action_type: "products.update" },
      }),
    );
  });

  it("refuses double approval and missing executors", async () => {
    getActionMock.mockResolvedValueOnce(action("approved"));
    expect((await approveAction(request(`/actions/${actionId}/approve`), context)).status).toBe(
      409,
    );
    getActionMock.mockResolvedValueOnce(action());
    executorMock.mockReturnValueOnce(null);
    expect((await approveAction(request(`/actions/${actionId}/approve`), context)).status).toBe(
      409,
    );
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("losing concurrent approval returns conflict without executing", async () => {
    updateMock.mockImplementationOnce(() => {
      throw Object.assign(new Error("Automation action changed before transition"), {
        status: 409,
      });
    });
    const execute = vi.fn();
    executorMock.mockReturnValueOnce({ execute });
    const response = await approveAction(request(`/actions/${actionId}/approve`), context);
    expect(response.status).toBe(409);
    expect(execute).not.toHaveBeenCalled();
  });

  it("audits execution failures separately with their error code", async () => {
    executorMock.mockReturnValueOnce({
      execute: vi.fn().mockRejectedValue(
        Object.assign(new Error("Rejected by executor"), {
          code: "AUTOMATION_VALIDATION_ERROR",
        }),
      ),
    });
    const response = await approveAction(request(`/actions/${actionId}/approve`), context);
    expect(response.status).toBe(422);
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "automation.action.approval_failed",
        details: {
          action_type: "products.update",
          error_code: "AUTOMATION_VALIDATION_ERROR",
        },
      }),
    );
  });

  it("rejects without executing and records the reason", async () => {
    const response = await rejectAction(
      request(`/actions/${actionId}/reject`, { reason: "Not appropriate" }),
      context,
    );
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      siteId,
      actionId,
      expect.objectContaining({ status: "cancelled", error_message: "Not appropriate" }),
      undefined,
      "manual_attention",
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "automation.action.rejected" }),
    );
    expect(executorMock).not.toHaveBeenCalled();
  });

  it("rolls back a succeeded action and records the audit event", async () => {
    getActionMock.mockResolvedValueOnce(action("succeeded"));
    const response = await rollbackAction(request(`/actions/${actionId}/rollback`), context);
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      siteId,
      actionId,
      expect.objectContaining({ status: "rolled_back" }),
      undefined,
      "succeeded",
    );
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "automation.action.rolled_back" }),
    );
  });

  it("refuses rollback conflicts and invalid statuses", async () => {
    getActionMock.mockResolvedValueOnce(action("running"));
    expect((await rollbackAction(request(`/actions/${actionId}/rollback`), context)).status).toBe(
      409,
    );
    getActionMock.mockResolvedValueOnce(action("succeeded"));
    executorMock.mockReturnValueOnce({
      rollback: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("Product changed"), { status: 409 })),
    });
    expect((await rollbackAction(request(`/actions/${actionId}/rollback`), context)).status).toBe(
      409,
    );
  });

  it("refuses machine callers on approve, reject, and rollback", async () => {
    requireAdminMock.mockResolvedValue({
      error: null,
      session: admin,
      dbSiteId: siteId,
      siteSlug: "site-1",
      caller: { type: "machine", tokenId: "token-1" },
    });
    for (const handler of [approveAction, rejectAction, rollbackAction]) {
      expect(
        (await handler(request(`/actions/${actionId}`, undefined, false), context)).status,
      ).toBe(403);
    }
    expect(getActionMock).not.toHaveBeenCalled();
  });

  it("site-scopes lookup and lists newest actions with filters", async () => {
    getActionMock.mockResolvedValueOnce(null);
    expect((await approveAction(request(`/actions/${actionId}/approve`), context)).status).toBe(
      404,
    );
    await listActions(
      new NextRequest(
        "https://example.test/api/admin/automation/actions?status=manual_attention&limit=10&offset=20",
        { headers: { cookie: "__Host-nh_admin_token=session" } },
      ),
    );
    expect(listMock).toHaveBeenCalledWith(siteId, {
      status: "manual_attention",
      limit: 10,
      offset: 20,
    });
  });
});
