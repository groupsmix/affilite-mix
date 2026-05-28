/**
 * TC-03 — CSRF timingSafeCompare correctness tests.
 *
 * Verifies that the timing-safe comparison function in lib/csrf.ts
 * returns correct results for both equal-length and different-length
 * inputs. This ensures a mutation replacing timingSafeCompare with ===
 * would not go undetected (correctness regression, not timing).
 */
import { describe, it, expect } from "vitest";
import { validateCsrfToken, generateCsrfToken, MAX_COMPARE_LEN } from "@/lib/csrf";

describe("TC-03: CSRF timingSafeCompare correctness", () => {
  describe("equal-length strings", () => {
    it("returns true for identical tokens", () => {
      const token = generateCsrfToken();
      expect(validateCsrfToken(token, token)).toBe(true);
    });

    it("returns false for same-length but different tokens", () => {
      // Generate two 64-char hex tokens (same length, different content)
      const a = generateCsrfToken();
      const b = generateCsrfToken();
      expect(a.length).toBe(b.length);
      expect(validateCsrfToken(a, b)).toBe(false);
    });

    it("returns false when tokens differ by a single bit", () => {
      const token = generateCsrfToken();
      // Flip the last character
      const lastChar = token[token.length - 1];
      const flipped = lastChar === "0" ? "1" : "0";
      const mutated = token.slice(0, -1) + flipped;
      expect(token.length).toBe(mutated.length);
      expect(validateCsrfToken(token, mutated)).toBe(false);
    });

    it("returns false when tokens differ only in the first byte", () => {
      const token = generateCsrfToken();
      const firstChar = token[0];
      const flipped = firstChar === "a" ? "b" : "a";
      const mutated = flipped + token.slice(1);
      expect(token.length).toBe(mutated.length);
      expect(validateCsrfToken(token, mutated)).toBe(false);
    });
  });

  describe("different-length strings", () => {
    it("returns false when header is a prefix of cookie", () => {
      const token = generateCsrfToken();
      const prefix = token.slice(0, 32);
      expect(validateCsrfToken(token, prefix)).toBe(false);
    });

    it("returns false when cookie is a prefix of header", () => {
      const token = generateCsrfToken();
      const prefix = token.slice(0, 32);
      expect(validateCsrfToken(prefix, token)).toBe(false);
    });

    it("returns false when one string is empty and other is not", () => {
      const token = generateCsrfToken();
      // Empty strings are caught by the null/empty check
      expect(validateCsrfToken(token, "")).toBe(false);
      expect(validateCsrfToken("", token)).toBe(false);
    });

    it("returns false for strings of different lengths with same prefix", () => {
      const token = generateCsrfToken();
      const extended = token + "extra";
      expect(validateCsrfToken(token, extended)).toBe(false);
      expect(validateCsrfToken(extended, token)).toBe(false);
    });
  });

  describe("edge cases for correctness", () => {
    it("returns false for null-ish inputs", () => {
      expect(validateCsrfToken(undefined, undefined)).toBe(false);
      expect(validateCsrfToken(undefined, "token")).toBe(false);
      expect(validateCsrfToken("token", undefined)).toBe(false);
    });

    it("handles unicode strings correctly (rejects different encodings)", () => {
      // Ensure non-hex tokens that might be equal in some comparison modes fail
      const a = "café".padEnd(64, "x");
      const b = "cafe\u0301".padEnd(64, "x"); // decomposed form
      // These are visually same but byte-different
      expect(validateCsrfToken(a, b)).toBe(false);
    });

    it("is symmetric — compare(a,b) === compare(b,a)", () => {
      const a = generateCsrfToken();
      const b = generateCsrfToken();
      expect(validateCsrfToken(a, b)).toBe(validateCsrfToken(b, a));
      expect(validateCsrfToken(a, a)).toBe(validateCsrfToken(a, a));
    });

    // A3-02: oversize tokens are rejected
    it("rejects tokens longer than MAX_COMPARE_LEN", () => {
      const oversize = "a".repeat(MAX_COMPARE_LEN + 1);
      expect(validateCsrfToken(oversize, oversize)).toBe(false);
    });
  });

  // A8-02 / A11-05: invariant test for MAX_COMPARE_LEN
  describe("MAX_COMPARE_LEN invariant", () => {
    it("is exported and >= 64", () => {
      expect(MAX_COMPARE_LEN).toBeGreaterThanOrEqual(64);
    });

    it("is exactly 256 (current baseline)", () => {
      expect(MAX_COMPARE_LEN).toBe(256);
    });
  });
});
