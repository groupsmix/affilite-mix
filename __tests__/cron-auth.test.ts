import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { verifyCronAuth } from "@/lib/cron-auth";
import { NextRequest } from "next/server";

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) {
    headers.set("authorization", authHeader);
  }
  return new NextRequest("https://example.com/api/cron/publish", {
    method: "POST",
    headers,
  });
}

describe("verifyCronAuth", () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalEnv;
    }
  });

  it("returns false when CRON_SECRET is not configured (fail-closed)", () => {
    delete process.env.CRON_SECRET;
    const req = makeRequest("Bearer some-token");
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("returns false when no Authorization header is present", () => {
    process.env.CRON_SECRET = "my-cron-secret";
    const req = makeRequest();
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("returns false when Authorization header has wrong format", () => {
    process.env.CRON_SECRET = "my-cron-secret";
    const req = makeRequest("Basic my-cron-secret");
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("returns false when token does not match CRON_SECRET", () => {
    process.env.CRON_SECRET = "correct-secret";
    const req = makeRequest("Bearer wrong-secret");
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("returns true when Bearer token matches CRON_SECRET", () => {
    process.env.CRON_SECRET = "my-cron-secret";
    const req = makeRequest("Bearer my-cron-secret");
    expect(verifyCronAuth(req)).toBe(true);
  });

  it("returns false for tokens of different lengths (timing-safe)", () => {
    process.env.CRON_SECRET = "short";
    const req = makeRequest("Bearer a-much-longer-token-value");
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("returns false for empty Bearer token", () => {
    process.env.CRON_SECRET = "my-cron-secret";
    const req = makeRequest("Bearer ");
    expect(verifyCronAuth(req)).toBe(false);
  });
});

// ── B-3: per-trigger secrets ────────────────────────────────
describe("verifyCronAuth — per-trigger secrets (B-3)", () => {
  const names = ["CRON_PUBLISH_SECRET", "CRON_AI_SECRET", "CRON_SITEMAP_SECRET", "CRON_SECRET"];
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const n of names) {
      saved[n] = process.env[n];
      delete process.env[n];
    }
  });
  afterEach(() => {
    for (const n of names) {
      if (saved[n] === undefined) delete process.env[n];
      else process.env[n] = saved[n];
    }
  });

  it("accepts the per-trigger secret when set", () => {
    process.env.CRON_PUBLISH_SECRET = "publish-only-secret";
    const req = makeRequest("Bearer publish-only-secret");
    expect(verifyCronAuth(req, { secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"] })).toBe(
      true,
    );
  });

  it("falls back to CRON_SECRET when per-trigger secret is unset", () => {
    process.env.CRON_SECRET = "fallback-secret";
    const req = makeRequest("Bearer fallback-secret");
    expect(verifyCronAuth(req, { secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"] })).toBe(
      true,
    );
  });

  it("rejects when neither per-trigger nor fallback is configured", () => {
    const req = makeRequest("Bearer anything");
    expect(verifyCronAuth(req, { secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"] })).toBe(
      false,
    );
  });

  it("rejects a secret intended for a different trigger", () => {
    process.env.CRON_AI_SECRET = "ai-only-secret";
    const req = makeRequest("Bearer ai-only-secret");
    // publish route only accepts CRON_PUBLISH_SECRET / CRON_SECRET
    expect(verifyCronAuth(req, { secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"] })).toBe(
      false,
    );
  });

  it("accepts either per-trigger OR fallback when both are configured", () => {
    process.env.CRON_PUBLISH_SECRET = "publish-secret";
    process.env.CRON_SECRET = "shared-secret";
    const reqA = makeRequest("Bearer publish-secret");
    const reqB = makeRequest("Bearer shared-secret");
    const opts = { secretEnvVars: ["CRON_PUBLISH_SECRET", "CRON_SECRET"] };
    expect(verifyCronAuth(reqA, opts)).toBe(true);
    expect(verifyCronAuth(reqB, opts)).toBe(true);
  });
});
