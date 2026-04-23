import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

interface FakeStub {
  fetch: (input: unknown, init?: { body?: string }) => Promise<Response>;
}

function makeDONamespace(fetchImpl: FakeStub["fetch"]) {
  return {
    idFromName: (name: string) => ({ name }),
    get: (_: unknown) => ({ fetch: fetchImpl }) as FakeStub,
  };
}

describe("F-005 Durable Object rate limiter integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the DO binding over KV when both are present", async () => {
    const doFetch = vi
      .fn()
      .mockResolvedValue(Response.json({ allowed: true, remaining: 4, retryAfterMs: 0 }));
    const kvGet = vi.fn();
    const kvPut = vi.fn();

    vi.stubGlobal("RATE_LIMITER_DO", makeDONamespace(doFetch));
    vi.stubGlobal("RATE_LIMIT_KV", { get: kvGet, put: kvPut });

    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit("do-key-1", { maxRequests: 5, windowMs: 60_000 });

    expect(result).toEqual({ allowed: true, remaining: 4, retryAfterMs: 0 });
    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(kvGet).not.toHaveBeenCalled();
    expect(kvPut).not.toHaveBeenCalled();
  });

  it("forwards the key and config in the DO request body", async () => {
    let captured: { key?: string; maxRequests?: number; windowMs?: number } = {};
    const doFetch = vi.fn().mockImplementation(async (_, init?: { body?: string }) => {
      captured = JSON.parse(init?.body ?? "{}");
      return Response.json({ allowed: true, remaining: 0, retryAfterMs: 0 });
    });
    vi.stubGlobal("RATE_LIMITER_DO", makeDONamespace(doFetch));

    const { checkRateLimit } = await import("@/lib/rate-limit");
    await checkRateLimit("ip:203.0.113.1", { maxRequests: 60, windowMs: 60_000 });

    expect(captured.key).toBe("ip:203.0.113.1");
    expect(captured.maxRequests).toBe(60);
    expect(captured.windowMs).toBe(60_000);
  });

  it("falls back to KV when the DO request errors", async () => {
    const doFetch = vi.fn().mockRejectedValue(new Error("DO unavailable"));
    const kvGet = vi.fn().mockResolvedValue(null);
    const kvPut = vi.fn().mockResolvedValue(undefined);

    vi.stubGlobal("RATE_LIMITER_DO", makeDONamespace(doFetch));
    vi.stubGlobal("RATE_LIMIT_KV", { get: kvGet, put: kvPut });

    const { checkRateLimit } = await import("@/lib/rate-limit");

    const result = await checkRateLimit("fallback-key", { maxRequests: 3, windowMs: 60_000 });

    expect(doFetch).toHaveBeenCalledTimes(1);
    expect(kvGet).toHaveBeenCalled();
    expect(kvPut).toHaveBeenCalled();
    expect(result.allowed).toBe(true);
  });
});
