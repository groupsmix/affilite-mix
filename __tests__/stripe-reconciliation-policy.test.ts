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

describe("F1 residual: the DB function blocks terminal->active via live webhooks", () => {
  // The reconciliation cron only fixes the periodic-sweep path. The live webhook
  // path (invoice.paid -> renew_membership, customer.subscription.updated ->
  // update_status) previously set status='active' unconditionally, resurrecting a
  // disputed/cancelled membership at the next billing cycle. Migration 2026062202
  // adds a DB-level terminal-state guard so neither op can reactivate a terminal row.
  const migration = readFileSync(
    resolve(__dirname, "..", "supabase/migrations/2026062202_stripe_terminal_state_guard.sql"),
    "utf8",
  );

  it("renew_membership preserves a terminal status instead of forcing 'active'", () => {
    // The renew branch must guard status with a CASE that keeps disputed/cancelled.
    expect(migration).toMatch(
      /renew_membership[\s\S]*?status\s*=\s*CASE[\s\S]*?WHEN status IN \('disputed',\s*'cancelled'\) THEN status[\s\S]*?ELSE 'active'/,
    );
  });

  it("update_status cannot flip a terminal membership back to 'active'", () => {
    expect(migration).toMatch(
      /update_status[\s\S]*?WHEN status IN \('disputed',\s*'cancelled'\)[\s\S]*?\(p_event_data ->> 'status'\)\s*=\s*'active'[\s\S]*?THEN status/,
    );
  });

  it("still records out-of-order deliveries via the missed_update rowcount guard", () => {
    // Preserve the S1-A10-03 behaviour from the prior definition.
    expect(migration).toContain("'missed_update', true");
  });

  it("keeps the SECURITY DEFINER search_path pin (G-CI-02)", () => {
    expect(migration).toContain("SET search_path = public, pg_temp");
  });

  it("ships a matching down-migration (E-2 rollback requirement)", () => {
    const down = readFileSync(
      resolve(
        __dirname,
        "..",
        "supabase/migrations-down/2026062202_stripe_terminal_state_guard-down.sql",
      ),
      "utf8",
    );
    expect(down).toContain("apply_stripe_membership_event");
  });
});
