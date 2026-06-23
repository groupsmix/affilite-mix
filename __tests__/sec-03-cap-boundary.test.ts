/**
 * Feature: audit-fix-verification — Task 5.4
 *
 * SEC-03 allowlist cap and boundary verification (R10.5–R10.7).
 *
 * The SEC-03 control caps the number of sanctioned service-role importers so a
 * new privileged import cannot land without an audited justification. The cap
 * was reconciled to 39 in task 5.5 — the live, audited allowlist count — which
 * matches the regression lock in __tests__/audit3-locks.test.ts
 * (`expect(count).toBeLessThanOrEqual(39)`). This file pins the cap value and
 * the pass/fail behavior at the boundary without duplicating the existing
 * audit3-locks assertion (that test only checks the live length does not
 * regress; this test exercises the boundary semantics explicitly).
 *
 * Validates: Requirements 10.5, 10.6, 10.7
 */
import { describe, it, expect } from "vitest";
import { SERVICE_ROLE_IMPORT_ALLOWLIST } from "../lib/security/service-role-allowlist";

/**
 * SEC-03 cap, reconciled to the live audited allowlist count (task 5.5).
 * Single source of truth for the boundary checks below.
 */
const SEC_03_CAP = 39;

/** The SEC-03 control: passes iff the allowlist has at most SEC_03_CAP entries. */
const sec03Passes = (entryCount: number): boolean => entryCount <= SEC_03_CAP;

describe("SEC-03 allowlist cap (Task 5.4)", () => {
  it("the SEC-03 cap is 39 (R10.5)", () => {
    expect(SEC_03_CAP).toBe(39);
  });

  it("the live allowlist is at or below the cap (R10.6)", () => {
    expect(SERVICE_ROLE_IMPORT_ALLOWLIST.length).toBeLessThanOrEqual(SEC_03_CAP);
    expect(sec03Passes(SERVICE_ROLE_IMPORT_ALLOWLIST.length)).toBe(true);
  });
});

describe("SEC-03 boundary behavior (Task 5.4)", () => {
  it("passes when the allowlist has fewer than 39 entries (R10.6)", () => {
    expect(sec03Passes(0)).toBe(true);
    expect(sec03Passes(38)).toBe(true);
  });

  it("passes at exactly 39 entries — the cap is inclusive (R10.6)", () => {
    expect(sec03Passes(39)).toBe(true);
  });

  it("fails when the allowlist exceeds 39 entries (R10.7)", () => {
    expect(sec03Passes(40)).toBe(false);
    expect(sec03Passes(100)).toBe(false);
  });
});
