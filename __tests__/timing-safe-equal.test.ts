/**
 * A2-02 / A6-06: timingSafeEqual hardening tests.
 *
 * Validates that the constant-time comparison in lib/internal-hmac.ts:
 *   1. Rejects inputs exceeding the safety cap (prevents CPU-exhaustion DoS).
 *   2. Still correctly compares equal and unequal strings within limits.
 */
import { describe, it, expect } from "vitest";
import { timingSafeEqual } from "@/lib/internal-hmac";

describe("A2-02: timingSafeEqual input length cap", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqual("abc", "abc")).toBe(true);
  });

  it("returns false for unequal strings of the same length", () => {
    expect(timingSafeEqual("abc", "abd")).toBe(false);
  });

  it("returns false for strings of different lengths", () => {
    expect(timingSafeEqual("abc", "abcd")).toBe(false);
  });

  it("returns false when either input exceeds MAX_COMPARE_LEN (1024)", () => {
    const oversized = "a".repeat(2000);
    const normal = "a".repeat(64);

    // Oversized `a` side
    expect(timingSafeEqual(oversized, normal)).toBe(false);
    // Oversized `b` side
    expect(timingSafeEqual(normal, oversized)).toBe(false);
    // Both oversized
    expect(timingSafeEqual(oversized, oversized)).toBe(false);
  });

  it("accepts strings up to 1024 characters", () => {
    const maxLen = "x".repeat(1024);
    expect(timingSafeEqual(maxLen, maxLen)).toBe(true);
  });

  it("rejects at 1025 characters", () => {
    const overLimit = "x".repeat(1025);
    expect(timingSafeEqual(overLimit, overLimit)).toBe(false);
  });

  it("works correctly for typical HMAC-SHA256 hex signatures (64 chars)", () => {
    const sig = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    expect(timingSafeEqual(sig, sig)).toBe(true);

    const altered = sig.slice(0, -1) + "0";
    expect(timingSafeEqual(sig, altered)).toBe(false);
  });
});
