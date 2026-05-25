/**
 * Tests for A97: Cross-tenant origin validation for telemetry endpoints.
 */

import { describe, it, expect } from "vitest";
import { isOriginAllowedForSite, getSiteScopedOrigins } from "@/lib/security/allowed-origins";

describe("A97: Cross-tenant origin validation", () => {
  describe("getSiteScopedOrigins", () => {
    it("returns only the specified site's origins", () => {
      const origins = getSiteScopedOrigins({ slug: "site-a", domain: "site-a.com" });
      expect(origins).toContain("https://site-a.com");
      // Should NOT contain other sites from static config
      expect(origins.filter((o) => o.includes("site-b"))).toHaveLength(0);
    });

    it("includes aliases for the site", () => {
      const origins = getSiteScopedOrigins({
        slug: "site-a",
        domain: "site-a.com",
        aliases: ["www.site-a.com", "alias.site-a.com"],
      });
      expect(origins).toContain("https://site-a.com");
      expect(origins).toContain("https://www.site-a.com");
      expect(origins).toContain("https://alias.site-a.com");
    });

    it("returns empty array for null site", () => {
      const origins = getSiteScopedOrigins(null);
      // Only dev localhost origins
      expect(origins.every((o) => o.includes("localhost"))).toBe(true);
    });
  });

  describe("isOriginAllowedForSite", () => {
    it("allows origin belonging to the target site", () => {
      const allowed = isOriginAllowedForSite(
        "https://site-a.com",
        "site-a",
        "site-a.com",
      );
      expect(allowed).toBe(true);
    });

    it("rejects origin from a different site (cross-tenant)", () => {
      const allowed = isOriginAllowedForSite(
        "https://site-b.com",
        "site-a",
        "site-a.com",
      );
      expect(allowed).toBe(false);
    });

    it("rejects when origin is null", () => {
      expect(isOriginAllowedForSite(null, "site-a", "site-a.com")).toBe(false);
    });

    it("rejects when siteId is null", () => {
      expect(isOriginAllowedForSite("https://site-a.com", null, "site-a.com")).toBe(false);
    });

    it("rejects unknown origin", () => {
      expect(isOriginAllowedForSite("https://attacker.com", "site-a", "site-a.com")).toBe(false);
    });
  });
});
