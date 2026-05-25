/**
 * Tests for A98-59: Newsletter token expiry validation.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
});
import {
  isTokenWithinExpiry,
  getTokenRemainingTtlSeconds,
  DEFAULT_TOKEN_TTL_DAYS,
  MAX_TOKEN_TTL_DAYS,
} from "@/lib/newsletter-token";

describe("A98-59: Newsletter token expiry", () => {
  describe("isTokenWithinExpiry", () => {
    it("accepts fresh token", () => {
      const created = new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(); // 1 day ago
      expect(isTokenWithinExpiry(created)).toBe(true);
    });

    it("rejects expired token (31 days old with 30-day default)", () => {
      const created = new Date(
        Date.now() - 1000 * 60 * 60 * 24 * (DEFAULT_TOKEN_TTL_DAYS + 1),
      ).toISOString();
      // In production, this should be false
      vi.stubEnv("NODE_ENV", "production");
      expect(isTokenWithinExpiry(created)).toBe(false);
    });

    it("respects custom TTL", () => {
      const created = new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(); // 5 days ago
      expect(isTokenWithinExpiry(created, 3)).toBe(false); // 3-day TTL expired
      expect(isTokenWithinExpiry(created, 7)).toBe(true); // 7-day TTL still valid
    });

    it("clamps TTL to MAX_TOKEN_TTL_DAYS", () => {
      const created = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString(); // 60 days
      // With 90-day max, 60 days should be valid
      expect(isTokenWithinExpiry(created, MAX_TOKEN_TTL_DAYS)).toBe(true);
      // Even if requesting 120 days, clamped to 90
      expect(isTokenWithinExpiry(created, 120)).toBe(true);
    });

    it("rejects null in production", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(isTokenWithinExpiry(null)).toBe(false);
    });

    it("rejects malformed dates", () => {
      vi.stubEnv("NODE_ENV", "production");
      expect(isTokenWithinExpiry("not-a-date")).toBe(false);
    });
  });

  describe("getTokenRemainingTtlSeconds", () => {
    it("returns positive for fresh token", () => {
      const created = new Date(Date.now() - 1000 * 60).toISOString(); // 1 minute ago
      const remaining = getTokenRemainingTtlSeconds(created);
      expect(remaining).toBeGreaterThan(0);
    });

    it("returns 0 for expired token", () => {
      const created = new Date(
        Date.now() - 1000 * 60 * 60 * 24 * (DEFAULT_TOKEN_TTL_DAYS + 1),
      ).toISOString();
      expect(getTokenRemainingTtlSeconds(created)).toBe(0);
    });

    it("returns 0 for null", () => {
      expect(getTokenRemainingTtlSeconds(null)).toBe(0);
    });
  });
});
