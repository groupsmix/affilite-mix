/**
 * SEC-CSRF-01 (#629): the CSRF token endpoint must be rate limited.
 *
 * These assertions exercise the route handler rather than its source text, so
 * they keep holding if the implementation is refactored and break if the
 * behaviour regresses.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { checkRateLimitMock } = vi.hoisted(() => ({
  checkRateLimitMock: vi.fn(async () => ({ allowed: true, retryAfterMs: 0 })),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: checkRateLimitMock,
}));

import { GET } from "@/app/api/auth/csrf/route";
import { CSRF_COOKIE } from "@/lib/csrf";

function makeRequest(ip = "203.0.113.7"): NextRequest {
  return new NextRequest("https://compareai.site/api/auth/csrf", {
    headers: { "cf-connecting-ip": ip },
  });
}

describe("SEC-CSRF-01 (#629): CSRF token endpoint rate limit", () => {
  beforeEach(() => {
    // getClientIp() only honours cf-connecting-ip for Cloudflare-only origins.
    vi.stubEnv("TRUST_CF_CONNECTING_IP", "true");
    checkRateLimitMock.mockClear();
    checkRateLimitMock.mockResolvedValue({ allowed: true, retryAfterMs: 0 });
  });

  it("rate limits per client IP with a grace fail policy", async () => {
    await GET(makeRequest("198.51.100.4"));

    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    const [key, options] = checkRateLimitMock.mock.calls[0] as unknown as [
      string,
      { maxRequests: number; windowMs: number; failPolicy: string },
    ];
    expect(key).toContain("csrf-token:");
    expect(key).toContain("198.51.100.4");
    expect(options.maxRequests).toBe(30);
    expect(options.windowMs).toBe(60_000);
    expect(options.failPolicy).toBe("grace");
  });

  it("issues a token in the body and mirrors it in an httpOnly cookie", async () => {
    const response = await GET(makeRequest());

    expect(response.status).toBe(200);
    const body = (await response.json()) as { csrfToken: string };
    expect(body.csrfToken).toBeTruthy();

    const cookie = response.cookies.get(CSRF_COOKIE);
    expect(cookie?.value).toBe(body.csrfToken);
    // The double-submit pattern reads the token from the body, so the cookie
    // stays out of reach of injected scripts.
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("strict");
  });

  it("issues a distinct token per request", async () => {
    const first = (await (await GET(makeRequest())).json()) as { csrfToken: string };
    const second = (await (await GET(makeRequest())).json()) as { csrfToken: string };

    expect(first.csrfToken).not.toBe(second.csrfToken);
  });

  it("returns 429 with Retry-After and no token once the limit is exceeded", async () => {
    checkRateLimitMock.mockResolvedValue({ allowed: false, retryAfterMs: 15_000 });

    const response = await GET(makeRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("15");
    expect(response.cookies.get(CSRF_COOKIE)).toBeUndefined();

    const body = (await response.json()) as Record<string, unknown>;
    expect(JSON.stringify(body)).not.toContain("csrfToken");
  });
});
