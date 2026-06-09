/**
 * F-013 — The previous JWT secret must only be honored inside a valid 24h
 * rotation window, enforced at read time (not just at cold start).
 *
 * On Cloudflare Workers a warm isolate can run for a long time without
 * re-running instrumentation.register(), so the startup throw alone could
 * keep accepting tokens signed with an expired JWT_SECRET_PREVIOUS.
 * getJwtSecretPrevious() must drop the previous key as soon as the window
 * lapses or is misconfigured.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getJwtSecretPrevious, __resetJwtSecretCacheForTests } from "@/lib/jwt-secret";

const KEYS = ["JWT_SECRET_PREVIOUS", "JWT_ROTATION_STARTED_AT"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of KEYS) saved[k] = process.env[k];
  __resetJwtSecretCacheForTests();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k]!;
  }
  __resetJwtSecretCacheForTests();
});

describe("getJwtSecretPrevious — rotation window enforcement (F-013)", () => {
  it("returns null when no previous secret is configured", () => {
    delete process.env.JWT_SECRET_PREVIOUS;
    delete process.env.JWT_ROTATION_STARTED_AT;
    expect(getJwtSecretPrevious()).toBeNull();
  });

  it("honors the previous secret inside a valid 24h window", () => {
    process.env.JWT_SECRET_PREVIOUS = "old-secret";
    process.env.JWT_ROTATION_STARTED_AT = new Date().toISOString();
    expect(getJwtSecretPrevious()).toBe("old-secret");
  });

  it("stops honoring the previous secret after the 24h window lapses", () => {
    process.env.JWT_SECRET_PREVIOUS = "old-secret";
    process.env.JWT_ROTATION_STARTED_AT = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(getJwtSecretPrevious()).toBeNull();
  });

  it("refuses the previous secret when JWT_ROTATION_STARTED_AT is missing (fail-safe)", () => {
    process.env.JWT_SECRET_PREVIOUS = "old-secret";
    delete process.env.JWT_ROTATION_STARTED_AT;
    expect(getJwtSecretPrevious()).toBeNull();
  });

  it("refuses the previous secret when JWT_ROTATION_STARTED_AT is malformed", () => {
    process.env.JWT_SECRET_PREVIOUS = "old-secret";
    process.env.JWT_ROTATION_STARTED_AT = "not-a-date";
    expect(getJwtSecretPrevious()).toBeNull();
  });
});
