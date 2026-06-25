/**
 * Task 2.5 — Bug 5 preservation tests (PHASE 2, run on UNFIXED code).
 *
 * BUG CONTEXT:
 * The auth-redirect assertion in `e2e/admin-content.spec.ts` and
 * `e2e/admin-products.spec.ts` uses the regex `/\/admin\/login|\/q7m-k4j9/`.
 * The right-hand alternative `\/q7m-k4j9` matches EVERY admin URL
 * unconditionally (captured in task 1.5).
 *
 * GOAL: Verify the CORRECT target regex `/\/q7m-k4j9\/login/` behaviour
 * IN ISOLATION — independently of which test files currently use it.
 * These tests are written BEFORE the fix is applied and PASS on unfixed code
 * because they test pure JavaScript regex semantics, not file content.
 *
 * Additionally, verify that the E2E helper functions `gotoAdminAndSettle` and
 * `isOnLoginPage` already use the correct login URL pattern and are untouched.
 *
 * OBSERVATION LOG (recorded from pure regex evaluation):
 *   - /\/q7m-k4j9\/login/.test("/q7m-k4j9/login")    → true  (login page matches ✓)
 *   - /\/q7m-k4j9\/login/.test("/q7m-k4j9/products") → false (non-login admin URL ✗)
 *   - /\/q7m-k4j9\/login/.test("/q7m-k4j9/content")  → false (non-login admin URL ✗)
 *   - /\/q7m-k4j9\/login/.test("/q7m-k4j9")          → false (root admin URL ✗)
 *   - isOnLoginPage (inline in spec files) uses `.includes("/q7m-k4j9/login")`
 *   - gotoAdminAndSettle uses `page.waitForURL(/\/q7m-k4j9\/login/, ...)`
 *
 * EXPECTED OUTCOME (on UNFIXED code): ALL tests PASS.
 * After the Bug 5 fix (tasks 7.1 / 7.2), these tests must continue to pass.
 *
 * Property 11: Preservation — Fixed regex matches the login page and only the login page
 * Validates: Requirements 3.1, 3.2
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import * as fs from "fs";
import * as path from "path";
import { isLoginPage } from "@/e2e/helpers/is-login-page";

// ─────────────────────────────────────────────────────────────────────────────
// The CORRECT regex (the target post-fix value) — tested in pure isolation.
// These tests pass on BOTH unfixed and fixed code because the regex itself
// is correct JavaScript — it doesn't depend on which spec file uses it.
// ─────────────────────────────────────────────────────────────────────────────

const CORRECT_REGEX = /\/q7m-k4j9\/login/;

// The admin prefix used throughout the test suite
const ADMIN_PREFIX = "/q7m-k4j9";
// The full login path
const LOGIN_PATH = "/q7m-k4j9/login";

// ─────────────────────────────────────────────────────────────────────────────
// Helper — read an E2E spec file's raw text (used for helper-function checks)
// ─────────────────────────────────────────────────────────────────────────────

const projectRoot = path.resolve(__dirname, "..");

function readSpecFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf-8");
}

// ─────────────────────────────────────────────────────────────────────────────
// Observation tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Bug 5 preservation — correct regex matches login page and only the login page", () => {
  // ── Positive match: login page URL ───────────────────────────────────────

  /**
   * Observation: /\/q7m-k4j9\/login/.test("/q7m-k4j9/login") → true
   *
   * Property 11: The correct regex MUST match the login page URL.
   * Validates: Requirements 3.1, 3.2
   */
  it("observation: correct regex matches /q7m-k4j9/login (login page)", () => {
    expect(CORRECT_REGEX.test("/q7m-k4j9/login")).toBe(true);
  });

  /**
   * Observation: correct regex matches a full absolute URL containing the login path.
   *
   * Playwright's `toHaveURL` receives a full URL, not just a pathname.
   * Validates: Requirements 3.1
   */
  it("observation: correct regex matches full URL http://localhost:3000/q7m-k4j9/login", () => {
    expect(CORRECT_REGEX.test("http://localhost:3000/q7m-k4j9/login")).toBe(true);
  });

  it("observation: correct regex matches URL with query string /q7m-k4j9/login?next=/dashboard", () => {
    expect(CORRECT_REGEX.test("/q7m-k4j9/login?next=/dashboard")).toBe(true);
  });

  it("observation: correct regex matches URL with trailing hash /q7m-k4j9/login#form", () => {
    expect(CORRECT_REGEX.test("/q7m-k4j9/login#form")).toBe(true);
  });

  // ── Negative match: non-login admin URLs ─────────────────────────────────

  /**
   * Observation: /\/q7m-k4j9\/login/.test("/q7m-k4j9/products") → false
   *
   * Property 11: The correct regex MUST NOT match non-login admin URLs.
   * This is the core preservation invariant — after the fix, E2E tests on
   * non-login pages must not accidentally pass.
   * Validates: Requirements 3.1, 3.2
   */
  it("observation: correct regex does NOT match /q7m-k4j9/products (protected page)", () => {
    expect(CORRECT_REGEX.test("/q7m-k4j9/products")).toBe(false);
  });

  it("observation: correct regex does NOT match /q7m-k4j9/content (protected page)", () => {
    expect(CORRECT_REGEX.test("/q7m-k4j9/content")).toBe(false);
  });

  it("observation: correct regex does NOT match /q7m-k4j9/users (protected page)", () => {
    expect(CORRECT_REGEX.test("/q7m-k4j9/users")).toBe(false);
  });

  it("observation: correct regex does NOT match /q7m-k4j9/analytics (protected page)", () => {
    expect(CORRECT_REGEX.test("/q7m-k4j9/analytics")).toBe(false);
  });

  it("observation: correct regex does NOT match /q7m-k4j9 (root admin URL, no login segment)", () => {
    expect(CORRECT_REGEX.test("/q7m-k4j9")).toBe(false);
  });

  it("observation: correct regex does NOT match /q7m-k4j9/settings (protected settings page)", () => {
    expect(CORRECT_REGEX.test("/q7m-k4j9/settings")).toBe(false);
  });

  // ── The stale left-branch of the buggy regex is not matched ──────────────

  /**
   * Observation: the old /admin/login path is NOT a valid admin login URL.
   * The correct regex correctly ignores the stale legacy path.
   * Validates: Requirements 3.1
   */
  it("observation: correct regex does NOT match legacy /admin/login (stale, pre-rename path)", () => {
    expect(CORRECT_REGEX.test("/admin/login")).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Property-based tests
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * P11a — For any URL string that CONTAINS /q7m-k4j9/login, the correct
   * regex MUST match.
   *
   * Playwright receives absolute URLs. Any URL that includes the login
   * segment — regardless of scheme, host, port, or path suffix — must match.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P11a (PBT): for any URL string containing /q7m-k4j9/login, the correct regex matches", () => {
    fc.assert(
      fc.property(
        // Build a URL by wrapping the login path with arbitrary prefix/suffix
        fc.tuple(
          fc.stringMatching(/^[a-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]{0,40}$/),
          fc.stringMatching(/^[a-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]{0,40}$/),
        ),
        ([prefix, suffix]) => {
          const url = prefix + LOGIN_PATH + suffix;
          expect(CORRECT_REGEX.test(url)).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * P11b — For any admin URL that does NOT contain /q7m-k4j9/login, the
   * correct regex MUST NOT match.
   *
   * This property ensures the fix tightens the assertion: any admin URL other
   * than the login URL will cause `toHaveURL(/\/q7m-k4j9\/login/)` to FAIL,
   * correctly detecting auth-guard regressions.
   *
   * We generate admin URLs by combining the admin prefix with a sub-path that
   * is guaranteed NOT to include the string "/login".
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P11b (PBT): for any admin URL not containing /q7m-k4j9/login, the correct regex does NOT match", () => {
    fc.assert(
      fc.property(
        // Generate an admin sub-path segment that is not "login"
        fc
          .stringMatching(/^[a-z][a-z0-9-]{1,15}$/)
          .filter((seg) => seg !== "login" && !seg.includes("login")),
        (subPath) => {
          const adminUrl = `${ADMIN_PREFIX}/${subPath}`;
          expect(CORRECT_REGEX.test(adminUrl)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * P11c — For any URL that contains the admin prefix WITHOUT the login suffix,
   * the correct regex must NOT match. (Exhaustive on common admin routes.)
   *
   * Generates multi-segment admin paths like /q7m-k4j9/products/new/edit.
   *
   * **Validates: Requirements 3.1, 3.2**
   */
  it("P11c (PBT): multi-segment admin URLs without login never match the correct regex", () => {
    fc.assert(
      fc.property(
        fc
          .array(
            fc.stringMatching(/^[a-z][a-z0-9-]{1,12}$/).filter((s) => !s.includes("login")),
            { minLength: 1, maxLength: 4 },
          )
          .map((segs) => `${ADMIN_PREFIX}/${segs.join("/")}`),
        (adminUrl) => {
          expect(CORRECT_REGEX.test(adminUrl)).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * P11d — Non-admin URLs never match the correct regex.
   *
   * Public routes, root path, and entirely unrelated URLs must not match.
   *
   * **Validates: Requirements 3.1**
   */
  it("P11d (PBT): non-admin URLs never match the correct regex", () => {
    const nonAdminUrls = [
      "/",
      "/about",
      "/products",
      "/login",
      "/admin/login",
      "https://example.com/",
      "https://example.com/admin/login",
      "",
      "/dashboard",
    ];

    for (const url of nonAdminUrls) {
      expect(CORRECT_REGEX.test(url)).toBe(false);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Helper function verification — isOnLoginPage and gotoAdminAndSettle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Verify that the standalone `isLoginPage` helper in e2e/helpers/is-login-page.ts
   * already uses the correct login URL pattern (.includes("/q7m-k4j9/login")).
   *
   * This is a static read of the source file to confirm the helpers are
   * untouched by the fix (which only changes the inline assertion regexes).
   *
   * Property 11: Preservation — helpers remain untouched
   * Validates: Requirements 3.1, 3.2
   */
  it("preservation: e2e/helpers/is-login-page.ts contains the correct login segment", () => {
    const helperSrc = readSpecFile("e2e/helpers/is-login-page.ts");
    // The helper must use the correct obfuscated login segment
    expect(helperSrc).toContain('"/q7m-k4j9/login"');
    // The helper must NOT reference the stale /admin/login path as a match target
    // (note: it may appear in comments, so we check for the string literal form)
    expect(helperSrc).not.toContain('"/admin/login"');
  });

  /**
   * Verify that the `isLoginPage` helper in e2e/helpers/is-login-page.ts
   * correctly returns true only for URLs containing /q7m-k4j9/login.
   *
   * This tests the imported function (not a copy), confirming the file is
   * in its preserved, correct state.
   *
   * Validates: Requirements 3.1, 3.2
   */
  it("preservation: isLoginPage helper correctly identifies the login page URL", () => {
    // Must match the login page
    expect(isLoginPage("/q7m-k4j9/login")).toBe(true);
    expect(isLoginPage("http://localhost:3000/q7m-k4j9/login")).toBe(true);
    expect(isLoginPage("/q7m-k4j9/login?next=/dashboard")).toBe(true);

    // Must NOT match non-login admin URLs
    expect(isLoginPage("/q7m-k4j9/products")).toBe(false);
    expect(isLoginPage("/q7m-k4j9/content")).toBe(false);
    expect(isLoginPage("/q7m-k4j9")).toBe(false);

    // Must NOT match legacy /admin/login
    expect(isLoginPage("/admin/login")).toBe(false);

    // Edge cases: null, undefined, empty string
    expect(isLoginPage(null)).toBe(false);
    expect(isLoginPage(undefined)).toBe(false);
    expect(isLoginPage("")).toBe(false);
  });

  /**
   * Verify `gotoAdminAndSettle` in admin-content.spec.ts uses the correct regex.
   *
   * Property 11: Preservation — gotoAdminAndSettle must remain untouched.
   * Validates: Requirements 3.1, 3.2
   */
  it("preservation: gotoAdminAndSettle in admin-content.spec.ts uses /\\/q7m-k4j9\\/login/ regex", () => {
    const specSrc = readSpecFile("e2e/admin-content.spec.ts");
    // The helper must use the correct login regex
    expect(specSrc).toContain("waitForURL(/\\/q7m-k4j9\\/login/");
    // The helper must use .includes("/q7m-k4j9/login") for isOnLoginPage
    expect(specSrc).toContain('page.url().includes("/q7m-k4j9/login")');
  });

  /**
   * Verify `gotoAdminAndSettle` in admin-products.spec.ts uses the correct regex.
   *
   * Property 11: Preservation — gotoAdminAndSettle must remain untouched.
   * Validates: Requirements 3.1, 3.2
   */
  it("preservation: gotoAdminAndSettle in admin-products.spec.ts uses /\\/q7m-k4j9\\/login/ regex", () => {
    const specSrc = readSpecFile("e2e/admin-products.spec.ts");
    // The helper must use the correct login regex
    expect(specSrc).toContain("waitForURL(/\\/q7m-k4j9\\/login/");
    // The helper must use .includes("/q7m-k4j9/login") for isOnLoginPage
    expect(specSrc).toContain('page.url().includes("/q7m-k4j9/login")');
  });

  /**
   * Verify that the CORRECT regex is now present in both spec files
   * (confirming tasks 7.1 and 7.2 have been applied).
   *
   * After the fix (tasks 7.1/7.2), the buggy regex is replaced with the
   * tight login-only regex /\/q7m-k4j9\/login/.
   *
   * Validates: Requirements 3.1 (post-fix state)
   */
  it("post-fix state: admin-content.spec.ts now contains the correct regex", () => {
    const specSrc = readSpecFile("e2e/admin-content.spec.ts");
    // The unauthenticated redirect test now uses the correct tight regex
    expect(specSrc).toContain("toHaveURL(/\\/q7m-k4j9\\/login/)");
    // The buggy overly-broad regex is no longer present
    expect(specSrc).not.toContain("/\\/admin\\/login|\\/q7m-k4j9/");
  });

  it("post-fix state: admin-products.spec.ts now contains the correct regex", () => {
    const specSrc = readSpecFile("e2e/admin-products.spec.ts");
    // The unauthenticated redirect test now uses the correct tight regex
    expect(specSrc).toContain("toHaveURL(/\\/q7m-k4j9\\/login/)");
    // The buggy overly-broad regex is no longer present
    expect(specSrc).not.toContain("/\\/admin\\/login|\\/q7m-k4j9/");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Contrast: buggy vs. correct regex for the same inputs
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Contrast test — demonstrates the exact difference between the buggy and
   * correct regexes for the admin content and products URLs targeted in the fix.
   *
   * The buggy regex incorrectly accepts these non-login admin URLs.
   * The correct regex correctly rejects them.
   *
   * This test PASSES on both unfixed and fixed code (pure regex evaluation).
   * Validates: Requirements 3.1, 3.2
   */
  it("contrast: buggy regex accepts non-login admin URLs, correct regex rejects them", () => {
    const BUGGY_REGEX = /\/admin\/login|\/q7m-k4j9/;
    const nonLoginAdminUrls = [
      "http://localhost:3000/q7m-k4j9/content",
      "http://localhost:3000/q7m-k4j9/products",
    ];

    for (const url of nonLoginAdminUrls) {
      // Buggy regex incorrectly matches (always passes the assertion even when wrong page)
      expect(BUGGY_REGEX.test(url)).toBe(true);
      // Correct regex correctly rejects (assertion only passes on the login page)
      expect(CORRECT_REGEX.test(url)).toBe(false);
    }
  });

  /**
   * Contrast test — both buggy and correct regexes match the actual login URL.
   *
   * Confirms the fix doesn't break the happy-path assertion (user is redirected
   * to login — test should still pass after the fix).
   *
   * Validates: Requirements 3.1, 3.2
   */
  it("contrast: both buggy and correct regexes match the actual login URL", () => {
    const BUGGY_REGEX = /\/admin\/login|\/q7m-k4j9/;
    const loginUrls = [
      "http://localhost:3000/q7m-k4j9/login",
      "/q7m-k4j9/login",
      "/q7m-k4j9/login?next=/q7m-k4j9/products",
    ];

    for (const url of loginUrls) {
      expect(BUGGY_REGEX.test(url)).toBe(true);
      expect(CORRECT_REGEX.test(url)).toBe(true);
    }
  });
});
