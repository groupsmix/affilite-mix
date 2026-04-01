import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyCronAuth } from "@/lib/cron-auth";
import { NextRequest } from "next/server";

function makeRequest(authHeader?: string): NextRequest {
  const headers = new Headers();
  if (authHeader) headers.set("authorization", authHeader);
  return new NextRequest("https://example.com/api/cron/publish", { headers });
}

describe("verifyCronAuth", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it("returns true for a valid Bearer token matching CRON_SECRET", () => {
    process.env.CRON_SECRET = "my-secret-token";
    const req = makeRequest("Bearer my-secret-token");
    expect(verifyCronAuth(req)).toBe(true);
  });

  it("returns false when token does not match CRON_SECRET", () => {
    process.env.CRON_SECRET = "my-secret-token";
    const req = makeRequest("Bearer wrong-token");
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("returns false when CRON_SECRET is not set (fail-closed)", () => {
    delete process.env.CRON_SECRET;
    const req = makeRequest("Bearer some-token");
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("returns false when authorization header is missing", () => {
    process.env.CRON_SECRET = "my-secret-token";
    const req = makeRequest();
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("returns false for non-Bearer auth scheme", () => {
    process.env.CRON_SECRET = "my-secret-token";
    const req = makeRequest("Basic my-secret-token");
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("returns false for empty Bearer token", () => {
    process.env.CRON_SECRET = "my-secret-token";
    const req = makeRequest("Bearer ");
    expect(verifyCronAuth(req)).toBe(false);
  });

  it("handles tokens of different lengths safely", () => {
    process.env.CRON_SECRET = "short";
    const req = makeRequest("Bearer a-much-longer-token-value");
    expect(verifyCronAuth(req)).toBe(false);
  });
});
