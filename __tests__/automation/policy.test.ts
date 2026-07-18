import { describe, it, expect } from "vitest";
import { evaluatePolicy, requiredScopeFor, isActionType } from "@/lib/automation/policy";

describe("automation policy engine", () => {
  it("auto-allows low-risk draft creation", () => {
    const d = evaluatePolicy({ actionType: "content.draft.create" });
    expect(d.decision).toBe("allow");
    expect(d.risk).toBe("low");
  });

  it("auto-allows publishing for tokens that hold the content:publish scope", () => {
    const d = evaluatePolicy({ actionType: "content.publish" });
    expect(d.decision).toBe("allow");
    expect(d.risk).toBe("low");
  });

  it("permanently denies deletes regardless of override", () => {
    const d = evaluatePolicy({
      actionType: "content.delete",
      override: { mode: "allow", constraints: {}, is_active: true },
    });
    expect(d.decision).toBe("deny");
    expect(d.risk).toBe("prohibited");
  });

  it("denies once the per-day limit is reached", () => {
    const d = evaluatePolicy({
      actionType: "content.draft.create",
      dayActionCount: 200,
      maxActionsPerDay: 200,
    });
    expect(d.decision).toBe("deny");
    expect(d.reasons.join(" ")).toMatch(/per-day/);
  });

  it("escalates bulk actions above the cap to approval", () => {
    const d = evaluatePolicy({ actionType: "content.update", itemCount: 10 });
    expect(d.decision).toBe("approval_required");
  });

  it("an active override can tighten an allow into a deny", () => {
    const d = evaluatePolicy({
      actionType: "content.update",
      override: { mode: "deny", constraints: {}, is_active: true },
    });
    expect(d.decision).toBe("deny");
  });

  it("an inactive override is ignored", () => {
    const d = evaluatePolicy({
      actionType: "content.update",
      override: { mode: "deny", constraints: {}, is_active: false },
    });
    expect(d.decision).toBe("allow");
  });

  it("affiliate URL updates are high-risk approval", () => {
    const d = evaluatePolicy({ actionType: "products.update_affiliate_url" });
    expect(d.decision).toBe("approval_required");
    expect(d.risk).toBe("high");
  });

  it("maps action types to required scopes and validates membership", () => {
    expect(requiredScopeFor("content.draft.create")).toBe("content:draft");
    expect(requiredScopeFor("content.delete")).toBeNull();
    expect(isActionType("content.publish")).toBe(true);
    expect(isActionType("nope")).toBe(false);
  });
});
