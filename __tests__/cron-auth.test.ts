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
