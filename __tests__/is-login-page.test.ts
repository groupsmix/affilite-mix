/**
 * Property-based verification for the `isLoginPage` pure helper (R6).
 *
 * Spec: audit-fix-verification, task 2.3 (Property 1).
 *
 * Location note: the design suggested `e2e/helpers/__tests__/is-login-page.test.ts`,
 * but `vitest.config.ts` excludes `e2e/**` from test *execution* (that tree is
 * owned by the Playwright runner). To keep this property under the normal
 * Vitest suite (`vitest run`), the test lives in `__tests__/` and imports the
 * pure helper from its real home via the `@` root alias. Vitest only excludes
 * `e2e/**` from collection, not from module resolution, so importing the helper
 * works.
 */
import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { isLoginPage } from "@/e2e/helpers/is-login-page";

// The single case-sensitive substring that defines a login URL.
const LOGIN_SEGMENT = "/q7m-k4j9/login";

/**
 * Input domain for the property: a mix of
 *   - strings that embed the obfuscated login segment (expected true),
 *   - strings that contain only `/admin/login` (expected false),
 *   - arbitrary strings (true iff they happen to contain the segment),
 *   - the empty string,
 *   - and non-string values: null, undefined, numbers, booleans, objects, arrays.
 */
const inputArbitrary: fc.Arbitrary<unknown> = fc.oneof(
  // Strings guaranteed to contain the obfuscated login segment.
  fc.tuple(fc.string(), fc.string()).map(([prefix, suffix]) => prefix + LOGIN_SEGMENT + suffix),
  // Strings containing `/admin/login` but (filtered) never the obfuscated segment.
  fc
    .tuple(fc.string(), fc.string())
    .map(([prefix, suffix]) => prefix + "/admin/login" + suffix)
    .filter((s) => !s.includes(LOGIN_SEGMENT)),
  // Wrong-case variants must not match (case-sensitivity guard).
  fc
    .tuple(fc.string(), fc.string())
    .map(([prefix, suffix]) => prefix + "/Q7M-K4J9/LOGIN" + suffix)
    .filter((s) => !s.includes(LOGIN_SEGMENT)),
  // Arbitrary strings.
  fc.string(),
  // Empty string.
  fc.constant(""),
  // Non-string inputs.
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.object(),
  fc.array(fc.anything()),
);

describe("isLoginPage — Property 1 (R6)", () => {
  // Feature: audit-fix-verification, Property 1: isLoginPage matches exactly the obfuscated login segment
  it("returns true iff the input is a string containing the case-sensitive segment, never throwing", () => {
    fc.assert(
      fc.property(inputArbitrary, (input) => {
        // Oracle: true exactly when input is a string containing the segment.
        const expected = typeof input === "string" && input.includes(LOGIN_SEGMENT);

        // Must never throw for any input.
        let result: boolean;
        expect(() => {
          result = isLoginPage(input);
        }).not.toThrow();

        // Result must equal the oracle and be a strict boolean.
        expect(result!).toBe(expected);
        expect(typeof result!).toBe("boolean");
      }),
      { numRuns: 100 },
    );
  });

  // Representative examples that pin the documented behavior (R6.1–R6.4).
  it("matches the documented examples", () => {
    // R6.1 — obfuscated segment present → true
    expect(isLoginPage("https://x.com/q7m-k4j9/login")).toBe(true);
    expect(isLoginPage("/q7m-k4j9/login?next=/dash")).toBe(true);
    // R6.2 — /admin/login without the obfuscated segment → false
    expect(isLoginPage("https://x.com/admin/login")).toBe(false);
    // R6.3 — any string lacking the segment → false (incl. wrong case)
    expect(isLoginPage("/q7m-k4j9/dashboard")).toBe(false);
    expect(isLoginPage("/Q7M-K4J9/LOGIN")).toBe(false);
    // R6.4 — null/undefined/empty/non-string → false, no throw
    expect(isLoginPage(null)).toBe(false);
    expect(isLoginPage(undefined)).toBe(false);
    expect(isLoginPage("")).toBe(false);
    expect(isLoginPage(123)).toBe(false);
    expect(isLoginPage({})).toBe(false);
  });
});
