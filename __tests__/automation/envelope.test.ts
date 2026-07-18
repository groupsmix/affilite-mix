import { describe, it, expect } from "vitest";
import { automationSuccess, automationError } from "@/lib/automation/envelope";

describe("automation envelope", () => {
  it("wraps success with ok:true, data and meta", async () => {
    const res = automationSuccess({ hello: "world" }, "req-1", { status: 201 });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ hello: "world" });
    expect(body.meta.request_id).toBe("req-1");
    expect(body.meta.api_version).toBeDefined();
  });

  it("carries run_id / action_id into meta when provided", async () => {
    const res = automationSuccess({}, "req-2", { meta: { run_id: "r1", action_id: "a1" } });
    const body = await res.json();
    expect(body.meta.run_id).toBe("r1");
    expect(body.meta.action_id).toBe("a1");
  });

  it("maps error codes to stable HTTP statuses", async () => {
    expect(automationError("AUTOMATION_UNAUTHENTICATED", "x", "r").status).toBe(401);
    expect(automationError("AUTOMATION_SCOPE_MISSING", "x", "r").status).toBe(403);
    expect(automationError("AUTOMATION_IDEMPOTENCY_CONFLICT", "x", "r").status).toBe(409);
    expect(automationError("AUTOMATION_POLICY_APPROVAL_REQUIRED", "x", "r").status).toBe(202);
    expect(automationError("AUTOMATION_VALIDATION_ERROR", "x", "r").status).toBe(422);
  });

  it("marks transient errors retryable and terminal ones not", async () => {
    const rate = await automationError("AUTOMATION_RATE_LIMITED", "x", "r").json();
    expect(rate.error.retryable).toBe(true);
    const denied = await automationError("AUTOMATION_POLICY_DENIED", "x", "r").json();
    expect(denied.error.retryable).toBe(false);
    expect(denied.ok).toBe(false);
    expect(denied.error.code).toBe("AUTOMATION_POLICY_DENIED");
  });
});
