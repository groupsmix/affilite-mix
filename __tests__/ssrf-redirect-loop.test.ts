/**
 * TC-01 — SSRF redirect loop integration test.
 *
 * Verifies that safeFetchWithRedirectValidation does not follow
 * unbounded redirect chains. With fetch mocked to always return a 302
 * pointing back to itself, the function must throw after a bounded
 * number of hops (currently limited by the call-stack or explicit max).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock dns resolution to always succeed (avoid network in unit tests)
vi.mock("dns/promises", () => ({
  resolve4: vi.fn().mockResolvedValue(["93.184.216.34"]),
  resolve6: vi.fn().mockResolvedValue([]),
}));

// Track fetch calls to prove bounded execution
let fetchCallCount = 0;
const MAX_REDIRECT_HOPS = 10; // matches the limit in ssrf-guard.ts

vi.mock("@/lib/fetch-timeout", () => ({
  fetchWithTimeout: vi.fn(async (url: string) => {
    fetchCallCount++;
    return new Response(null, {
      status: 302,
      headers: { location: url }, // Redirect to itself
    });
  }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

describe("TC-01: SSRF redirect loop protection", () => {
  beforeEach(() => {
    fetchCallCount = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws or stops after bounded redirect hops when URL redirects to itself", async () => {
    const { safeFetchWithRedirectValidation } = await import("@/lib/ssrf-guard");

    // The function must throw after the bounded number of hops
    await expect(safeFetchWithRedirectValidation("https://example.com/loop")).rejects.toThrow(
      /too many redirects/,
    );

    // Should have stopped at exactly MAX_REDIRECT_HOPS fetches
    expect(fetchCallCount).toBe(MAX_REDIRECT_HOPS);
  });

  it("throws on redirect to a blocked internal URL", async () => {
    const { fetchWithTimeout } = await import("@/lib/fetch-timeout");
    const mockedFetch = vi.mocked(fetchWithTimeout);

    // First call returns 302 to an internal IP
    mockedFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://169.254.169.254/latest/meta-data/" },
      }),
    );

    const { safeFetchWithRedirectValidation } = await import("@/lib/ssrf-guard");

    await expect(
      safeFetchWithRedirectValidation("https://example.com/redirect-to-internal"),
    ).rejects.toThrow(/SSRF/);
  });

  it("succeeds on a single valid redirect", async () => {
    const { fetchWithTimeout } = await import("@/lib/fetch-timeout");
    const mockedFetch = vi.mocked(fetchWithTimeout);

    // Reset to provide custom behavior for this test
    mockedFetch.mockReset();
    fetchCallCount = 0;

    // First call: redirect to another valid external URL
    mockedFetch.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://www.example.com/final" },
      }),
    );
    // Second call: final response
    mockedFetch.mockResolvedValueOnce(new Response("OK", { status: 200 }));

    const { safeFetchWithRedirectValidation } = await import("@/lib/ssrf-guard");

    const response = await safeFetchWithRedirectValidation("https://example.com/redir");
    expect(response.status).toBe(200);
  });

  it("returns the validated merchant hostname after IP-pinned fetching", async () => {
    const { fetchWithTimeout } = await import("@/lib/fetch-timeout");
    const mockedFetch = vi.mocked(fetchWithTimeout);
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue(new Response("OK", { status: 200 }));

    const { safeFetchWithRedirectMetadata } = await import("@/lib/ssrf-guard");
    const result = await safeFetchWithRedirectMetadata("https://example.com/landing");

    expect(result.finalUrl).toBe("https://example.com/landing");
    expect(result.finalUrl).not.toContain("93.184.216.34");
    expect(mockedFetch.mock.calls[0]?.[0]).toMatch(/^https:\/\/\d{1,3}(?:\.\d{1,3}){3}\//);
  });
});
