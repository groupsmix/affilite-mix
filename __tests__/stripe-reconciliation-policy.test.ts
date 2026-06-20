/**
 * F1 regression: OF-08 reconciliation must not auto-reactivate a membership that was
 * put into a terminal entitlement/fraud state, even when Stripe still reports the
 * subscription as active (a dispute or full refund does NOT cancel the subscription).
 *
 * Original bug: `app/api/cron/stripe-sync/route.ts` used
 *     if (dbMembership.status !== "active") { update -> "active" }
 * which swept "disputed" (chargeback) and "cancelled" (full refund) back to active on
 * the next cron tick, silently undoing the fraud hold.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  isReconcilableToActive,
  RECONCILABLE_TO_ACTIVE,
} from "../lib/stripe-reconciliation-policy";

describe("F1: stripe reconciliation entitlement policy", () => {
  it("never auto-reactivates a charged-back (disputed) membership", () => {
    expect(isReconcilableToActive("disputed")).toBe(false);
  });

  it("never auto-reactivates a refunded (cancelled) membership", () => {
    expect(isReconcilableToActive("cancelled")).toBe(false);
  });

  it("still repairs transient billing drift (past_due, expired)", () => {
    expect(isReconcilableToActive("past_due")).toBe(true);
    expect(isReconcilableToActive("expired")).toBe(true);
  });

  it("fails safe: an unknown or future status is not auto-reactivated", () => {
    expect(isReconcilableToActive("frozen_for_review")).toBe(false);
    expect(isReconcilableToActive("")).toBe(false);
  });

  it("allowlist holds only the two transient billing states", () => {
    expect([...RECONCILABLE_TO_ACTIVE].sort()).toEqual(["expired", "past_due"]);
  });
});

describe("F1: the cron route enforces the allowlist (guards against regression)", () => {
  const route = readFileSync(resolve(__dirname, "..", "app/api/cron/stripe-sync/route.ts"), "utf8");

  it("gates the stale-status branch through isReconcilableToActive", () => {
    expect(route).toContain("isReconcilableToActive(dbMembership.status)");
  });

  it("surfaces protected-status divergence instead of silently fixing it", () => {
    expect(route).toContain("NOT auto-reactivating");
    expect(route).toContain("reconcileSkipped");
  });
});
