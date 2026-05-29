/**
 * Tests for A90: Feature flags expiry enforcement and no-permanent-flags policy.
 */

import { describe, it, expect } from "vitest";
import {
  FLAG_REGISTRY,
  getExpiredFlags,
  validateFlagRegistry,
  MAX_FLAG_LIFETIME_DAYS,
} from "@/lib/feature-flags";

describe("A90: Feature flags policy", () => {
  describe("FLAG_REGISTRY", () => {
    it("has no flags with null expiresAt", () => {
      for (const flag of FLAG_REGISTRY) {
        expect(flag.expiresAt, `Flag ${flag.key} has null expiresAt`).not.toBeNull();
        expect(flag.expiresAt, `Flag ${flag.key} has empty expiresAt`).toBeTruthy();
      }
    });

    it("has ticketRef on every flag", () => {
      for (const flag of FLAG_REGISTRY) {
        expect(flag.ticketRef, `Flag ${flag.key} has no ticketRef`).toBeTruthy();
      }
    });

    it("has valid createdAt before expiresAt on every flag", () => {
      for (const flag of FLAG_REGISTRY) {
        const created = new Date(flag.createdAt).getTime();
        const expires = new Date(flag.expiresAt).getTime();
        expect(created, `Flag ${flag.key} invalid createdAt`).not.toBeNaN();
        expect(expires, `Flag ${flag.key} invalid expiresAt`).not.toBeNaN();
        expect(expires, `Flag ${flag.key} expires before created`).toBeGreaterThan(created);
      }
    });

    it("has lifetime within MAX_FLAG_LIFETIME_DAYS", () => {
      for (const flag of FLAG_REGISTRY) {
        const created = new Date(flag.createdAt).getTime();
        const expires = new Date(flag.expiresAt).getTime();
        const days = (expires - created) / (1000 * 60 * 60 * 24);
        expect(
          days,
          `Flag ${flag.key} lifetime ${days}d exceeds ${MAX_FLAG_LIFETIME_DAYS}d`,
        ).toBeLessThanOrEqual(MAX_FLAG_LIFETIME_DAYS);
      }
    });
  });

  describe("validateFlagRegistry", () => {
    it("returns empty errors for valid registry", () => {
      const errors = validateFlagRegistry();
      expect(errors).toEqual([]);
    });
  });

  describe("getExpiredFlags", () => {
    it("does not include flags expiring in the future", () => {
      const expired = getExpiredFlags();
      for (const flag of expired) {
        expect(new Date(flag.expiresAt).getTime()).toBeLessThanOrEqual(Date.now());
      }
    });
  });
});
