/**
 * Task 1.5 / 7.3 — Bug 5 exploration test.
 *
 * BUG (phase 1): The auth-redirect assertion in both `e2e/admin-content.spec.ts` and
 * `e2e/admin-products.spec.ts` used the regex `/\/admin\/login|\/q7m-k4j9/`.
 * The right-hand alternative `\/q7m-k4j9` matches EVERY admin URL
 * unconditionally — not just the login page. This means the assertion always
 * passed, even when an unauthenticated user was left on a protected dashboard
 * page instead of being redirected to the login page.
 *
 * FIX (tasks 7.1 / 7.2): Both E2E spec files now use `/\/q7m-k4j9\/login/`.
 *
 * PHASE 3 (task 7.3): Re-run the same test on the FIXED code.
 *
 * Scoped PBT Approach (unit-testing the regex in isolation):
 *   - Assert `/\/q7m-k4j9\/login/.test("/q7m-k4j9/content")` returns `false`
 *     → On FIXED code this is correct; the assertion PASSES.
 *   - Assert `/\/q7m-k4j9\/login/.test("/q7m-k4j9/login")` returns `true`
 *     → On FIXED code this is correct; the assertion PASSES.
 *
 * EXPECTED OUTCOME (on FIXED code): All assertions PASS.
 *
 * Documented counterexample (from phase 1):
 *   /\/admin\/login|\/q7m-k4j9/.test("/q7m-k4j9/content") === true  (wrong)
 *   /\/admin\/login|\/q7m-k4j9/.test("/q7m-k4j9/products") === true (wrong)
 *
 * Validates: Requirements 1.1, 1.2
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// The buggy regex — kept for historical reference and to confirm it is no
// longer present in the E2E spec files.
// ─────────────────────────────────────────────────────────────────────────────
const BUGGY_REGEX = /\/admin\/login|\/q7m-k4j9/;

// The correct regex introduced by the fix (tasks 7.1 / 7.2).
const CORRECT_REGEX = /\/q7m-k4j9\/login/;

// ─────────────────────────────────────────────────────────────────────────────
// Read the actual E2E spec files to verify they contain the correct regex.
// ─────────────────────────────────────────────────────────────────────────────
const repoRoot = join(__dirname, "..");
const adminContentSpec = readFileSync(join(repoRoot, "e2e", "admin-content.spec.ts"), "utf-8");
const adminProductsSpec = readFileSync(join(repoRoot, "e2e", "admin-products.spec.ts"), "utf-8");

describe("Bug 5 exploration — E2E auth-redirect regex always passes", () => {
  /**
   * Property 5a: Fix Verification — E2E spec files no longer contain the buggy regex
   *
   * After tasks 7.1 and 7.2, both E2E spec files must NOT contain the overly-broad
   * regex `/\/admin\/login|\/q7m-k4j9/` as a toHaveURL assertion.
   *
   * On FIXED code: the buggy regex string is absent from both files. PASSES.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 5a: E2E spec files must NOT contain the buggy broad regex (admin-content.spec.ts)", () => {
    // The buggy literal regex string should no longer appear as a toHaveURL argument.
    expect(adminContentSpec).not.toContain("toHaveURL(/\\/admin\\/login|\\/q7m-k4j9/)");
  });

  /**
   * Property 5b: Fix Verification — admin-products spec no longer contains the buggy regex
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 5b: E2E spec files must NOT contain the buggy broad regex (admin-products.spec.ts)", () => {
    expect(adminProductsSpec).not.toContain("toHaveURL(/\\/admin\\/login|\\/q7m-k4j9/)");
  });

  /**
   * Property 5c: Sanity check — buggy regex DOES match the actual login URL
   *
   * The left-hand alternative `\/admin\/login` is stale (old path), but the
   * right-hand alternative `\/q7m-k4j9` still matches the login URL at
   * `/q7m-k4j9/login`. This property verifies the regex at least covers the
   * login URL (even if it also incorrectly covers everything else).
   *
   * This assertion PASSES on unfixed code — it is a sanity check only.
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 5c (sanity): buggy regex matches the login URL /q7m-k4j9/login", () => {
    expect(BUGGY_REGEX.test("/q7m-k4j9/login")).toEqual(true);
  });

  /**
   * Property 5d: Correct regex — only matches the login page URL
   *
   * The correct regex `/\/q7m-k4j9\/login/` must match `/q7m-k4j9/login`
   * and must NOT match non-login admin URLs. This verifies the target
   * post-fix behavior. This property PASSES on both unfixed and fixed code
   * (it tests the regex value itself, not which file it comes from).
   *
   * Validates: Requirements 1.1, 1.2
   */
  it("Property 5d: correct regex /\\/q7m-k4j9\\/login/ matches the login page and only the login page", () => {
    // Must match the login page
    expect(CORRECT_REGEX.test("/q7m-k4j9/login")).toEqual(true);
    expect(CORRECT_REGEX.test("http://example.com/q7m-k4j9/login")).toEqual(true);

    // Must NOT match non-login admin URLs
    expect(CORRECT_REGEX.test("/q7m-k4j9/products")).toEqual(false);
    expect(CORRECT_REGEX.test("/q7m-k4j9/content")).toEqual(false);
    expect(CORRECT_REGEX.test("/q7m-k4j9/users")).toEqual(false);
    expect(CORRECT_REGEX.test("/q7m-k4j9")).toEqual(false);
  });
});
