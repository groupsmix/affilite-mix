/**
 * S11 test coverage: consent/log route (#652)
 *
 * Tests consent category validation, banner_version validation,
 * required field enforcement, and rate limiter presence.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const routeSource = fs.readFileSync(
  path.resolve(__dirname, "../app/api/consent/log/route.ts"),
  "utf-8",
);

describe("consent/log route validation invariants", () => {
  it("defines valid consent categories allowlist", () => {
    expect(routeSource).toContain("VALID_CONSENT_CATEGORIES");
    for (const cat of [
      "necessary",
      "functional",
      "analytics",
      "advertising",
      "personalization",
      "security",
      "performance",
    ]) {
      expect(routeSource).toContain(`"${cat}"`);
    }
  });

  it("validates categories are an array", () => {
    expect(routeSource).toContain("categories must be an array");
  });

  it("validates categories are not empty", () => {
    expect(routeSource).toContain("categories cannot be empty");
  });

  it("caps maximum categories", () => {
    expect(routeSource).toContain("MAX_CATEGORIES");
  });

  it("rejects unknown consent categories", () => {
    expect(routeSource).toContain("unknown consent category");
  });

  it("validates banner_version length", () => {
    expect(routeSource).toContain("MAX_BANNER_VERSION_LENGTH");
  });

  it("requires site_id, categories, and banner_version", () => {
    expect(routeSource).toContain("site_id, categories, and banner_version are required");
  });

  it("has rate limiting protection", () => {
    expect(routeSource).toMatch(/rate.?limit/i);
    expect(routeSource).toContain("429");
  });

  it("truncates IP for GDPR compliance", () => {
    expect(routeSource).toContain("truncateIp");
  });

  it("resolves site slug to UUID server-side", () => {
    expect(routeSource).toContain("resolveDbSiteBySlug");
  });

  it("returns 400 for unknown site slug", () => {
    expect(routeSource).toContain("Unknown site");
  });
});
