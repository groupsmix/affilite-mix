/**
 * F-TIM-02 — Correctness suite for the `timingSafeEqual` helper in
 * `lib/internal-hmac.ts`.
 *
 * The function previously looped `Math.max(a.length, b.length)`
 * iterations, leaking the longer input's length via wall-clock
 * latency — the same side-channel that audit F-17 fixed in
 * `lib/csrf.ts` and `lib/cron-auth.ts`. The fix aligns this module
 * with the others by running a fixed `MAX_COMPARE_LEN = 256`
 * iterations regardless of input length.
 *
 * Behavioural correctness (what this test asserts):
 *   - Identical inputs return true.
 *   - Any length mismatch returns false.
 *   - Any content mismatch on the same-length path returns false.
 *   - Edge cases (empty strings, unicode, very long inputs) return
 *     deterministically.
 *
 * Timing is not directly asserted here (microbenchmarks are noisy on
 * a Vitest worker pool) — the structural review of the source code
 * is the correctness signal for "no length side-channel". This test
 * file's role is to catch a behavioural regression that would silently
 * weaken any caller of `timingSafeEqual`.
 */

import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "@/lib/internal-hmac";

describe("F-TIM-02: timingSafeEqual correctness", () => {
  describe("equal-length inputs", () => {
    it("returns true for two empty strings", () => {
      expect(timingSafeEqual("", "")).toBe(true);
    });

    it("returns true for identical short strings", () => {
      expect(timingSafeEqual("abc", "abc")).toBe(true);
    });

    it("returns true for identical 64-char hex (typical HMAC digest)", () => {
      const hex = "a".repeat(64);
      expect(timingSafeEqual(hex, hex)).toBe(true);
    });

    it("returns false when strings differ in the last byte", () => {
      expect(timingSafeEqual("aaaaaaaaaaaa", "aaaaaaaaaaab")).toBe(false);
    });

    it("returns false when strings differ in the first byte", () => {
      expect(timingSafeEqual("baaaaaaaaaaa", "aaaaaaaaaaaa")).toBe(false);
    });

    it("returns false for completely different same-length strings", () => {
      expect(timingSafeEqual("abcdefghij", "0123456789")).toBe(false);
    });
  });

  describe("different-length inputs", () => {
    it("returns false when `a` is a prefix of `b`", () => {
      expect(timingSafeEqual("token", "token-extra")).toBe(false);
    });

    it("returns false when `b` is a prefix of `a`", () => {
      expect(timingSafeEqual("token-extra", "token")).toBe(false);
    });

    it("returns false when only one side is empty", () => {
      expect(timingSafeEqual("", "x")).toBe(false);
      expect(timingSafeEqual("x", "")).toBe(false);
    });

    it("returns false when inputs share no prefix and differ in length", () => {
      expect(timingSafeEqual("alpha", "beta-extra-bytes")).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles inputs longer than the internal MAX_COMPARE_LEN", () => {
      // MAX_COMPARE_LEN is 256; ensure the function still gives a
      // correct answer for an HMAC-style signature longer than that.
      const a = "x".repeat(512);
      const b = "x".repeat(512);
      expect(timingSafeEqual(a, b)).toBe(true);
      // Same length, one byte different
      expect(timingSafeEqual(a, "y" + b.slice(1))).toBe(false);
    });

    it("treats unicode strings byte-wise (NFC vs NFD do not match)", () => {
      // "café" in precomposed and decomposed forms render the same
      // glyph but have different UTF-8 byte sequences. The function
      // must reject the mismatch — anything that lets them compare
      // equal would silently weaken every caller that signs raw bytes.
      const nfc = "caf\u00e9";
      const nfd = "cafe\u0301";
      expect(timingSafeEqual(nfc, nfd)).toBe(false);
    });

    it("is symmetric — timingSafeEqual(a, b) === timingSafeEqual(b, a)", () => {
      const cases: Array<[string, string]> = [
        ["abc", "abc"],
        ["abc", "abd"],
        ["abc", "ab"],
        ["abc", "abcde"],
        ["", "abc"],
        ["", ""],
      ];
      for (const [a, b] of cases) {
        expect(timingSafeEqual(a, b)).toBe(timingSafeEqual(b, a));
      }
    });
  });
});
