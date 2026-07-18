import { describe, it, expect } from "vitest";
import {
  canTransition,
  assertTransition,
  isActionState,
  ACTION_STATES,
} from "@/lib/automation/action-state";

describe("automation action state machine", () => {
  it("allows the happy path proposed -> ... -> succeeded", () => {
    expect(canTransition("proposed", "policy_allowed")).toBe(true);
    expect(canTransition("policy_allowed", "running")).toBe(true);
    expect(canTransition("running", "verifying")).toBe(true);
    expect(canTransition("verifying", "succeeded")).toBe(true);
    expect(canTransition("succeeded", "rolled_back")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransition("succeeded", "running")).toBe(false);
    expect(canTransition("cancelled", "running")).toBe(false);
    expect(canTransition("rolled_back", "succeeded")).toBe(false);
  });

  it("assertTransition throws on illegal moves", () => {
    expect(() => assertTransition("cancelled", "running")).toThrow(/Illegal/);
    expect(assertTransition("running", "succeeded")).toBe("succeeded");
  });

  it("recognises valid state names", () => {
    for (const s of ACTION_STATES) expect(isActionState(s)).toBe(true);
    expect(isActionState("bogus")).toBe(false);
  });

  it("supports retry loop running -> retry_wait -> running", () => {
    expect(canTransition("running", "retry_wait")).toBe(true);
    expect(canTransition("retry_wait", "running")).toBe(true);
  });
});
