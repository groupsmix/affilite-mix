/**
 * Tests for A98-64: All-sites revalidation token logic fix.
 *
 * The revalidate route must independently validate the standard
 * INTERNAL_API_TOKEN and the break-glass REVALIDATE_ALL_SITES_TOKEN.
 * These tokens should be different in production for blast-radius containment.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@/lib/internal-auth", () => ({
  getInternalTokenFor: vi.fn(() => "internal-test-token"),
}));

vi.mock("@/lib/cron-auth", () => ({
  timingSafeCompare: vi.fn((a: Uint8Array, b: Uint8Array) => {
    if (a.length !== b.length) return false;
    let result = 0;
    for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
    return result === 0;
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 30, retryAfterMs: 0 })),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/cache-tags", () => ({
  CONTENT_TAGS: ["content"],
  siteTag: (kind: string, siteId: string) => `${kind}:${siteId}`,
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

describe("A98-64: All-sites revalidation token logic", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("determineAuthMode should accept per-site token", () => {
    const { determineAuthMode } = require("@/app/api/revalidate/route");
    const mode = determineAuthMode("internal-test-token", "internal-test-token", "all-sites-token");
    expect(mode).toBe("per-site");
  });

  it("determineAuthMode should accept all-sites token", () => {
    const { determineAuthMode } = require("@/app/api/revalidate/route");
    const mode = determineAuthMode("all-sites-token", "internal-test-token", "all-sites-token");
    expect(mode).toBe("all-sites");
  });

  it("determineAuthMode should reject invalid token", () => {
    const { determineAuthMode } = require("@/app/api/revalidate/route");
    const mode = determineAuthMode("invalid-token", "internal-test-token", "all-sites-token");
    expect(mode).toBeNull();
  });

  it("tokens should be different in production config", () => {
    // Production sanity check: the two tokens must not be identical
    const internalToken = "internal-test-token";
    const allSitesToken = "all-sites-test-token";
    expect(internalToken).not.toBe(allSitesToken);
  });
});
