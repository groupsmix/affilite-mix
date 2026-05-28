/**
 * 60-day roadmap: Rate-limit abuse tests for public endpoints.
 *
 * Verifies that rate limiting is configured correctly on all public-facing
 * endpoints and that security-critical routes use fail-closed policies.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

function readFile(relPath: string): string {
  return fs.readFileSync(path.resolve(__dirname, "..", relPath), "utf-8");
}

function fileExists(relPath: string): boolean {
  return fs.existsSync(path.resolve(__dirname, "..", relPath));
}

/** All public API routes that accept user input must have rate limiting */
const PUBLIC_ROUTES_REQUIRING_RATE_LIMIT = [
  "app/api/newsletter/route.ts",
  "app/api/newsletter/confirm/route.ts",
  "app/api/newsletter/unsubscribe/route.ts",
  "app/api/track/click/route.ts",
  "app/api/track/impression/route.ts",
  "app/api/community/comments/route.ts",
  "app/api/community/wrist-shots/route.ts",
  "app/api/gift-finder/route.ts",
  "app/api/auth/login/route.ts",
  "app/api/auth/forgot-password/route.ts",
  "app/api/auth/reset-password/route.ts",
  "app/api/auth/refresh/route.ts",
  "app/api/auth/me/route.ts",
  "app/api/membership/checkout/route.ts",
  "app/api/vitals/route.ts",
  "app/api/health/route.ts",
  "app/api/csp-report/route.ts",
];

/** Routes that handle financial or auth operations must fail closed */
const FAIL_CLOSED_ROUTES = [
  "app/api/auth/login/route.ts",
  "app/api/auth/forgot-password/route.ts",
  "app/api/auth/reset-password/route.ts",
  "app/api/auth/refresh/route.ts",
  "app/api/auth/me/route.ts",
  "app/api/membership/checkout/route.ts",
  "app/api/gift-finder/route.ts",
];

describe("Rate-limit abuse protection: all public routes", () => {
  for (const route of PUBLIC_ROUTES_REQUIRING_RATE_LIMIT) {
    it(`${route} has rate limiting`, () => {
      if (!fileExists(route)) return;
      const content = readFile(route);
      expect(content).toContain("checkRateLimit");
    });

    it(`${route} uses centralized IP or session-keyed rate limiting`, () => {
      if (!fileExists(route)) return;
      const content = readFile(route);
      // POST handlers must use getClientIp or session-keyed rate limiting
      if (content.includes("export async function POST") || content.includes("export const POST")) {
        const usesGetClientIp = content.includes("getClientIp");
        const usesSessionKey =
          content.includes("session.email") || content.includes("session.userId");
        expect(
          usesGetClientIp || usesSessionKey,
          `${route} POST handler uses neither getClientIp nor session-keyed rate limiting`,
        ).toBe(true);
      }
    });
  }
});

describe("Rate-limit abuse protection: fail-closed on sensitive routes", () => {
  for (const route of FAIL_CLOSED_ROUTES) {
    it(`${route} uses failPolicy: "closed"`, () => {
      if (!fileExists(route)) return;
      const content = readFile(route);
      expect(content).toContain('failPolicy: "closed"');
    });
  }
});

describe("Rate-limit abuse protection: newsletter endpoint", () => {
  it("newsletter POST has IP-based rate limit", () => {
    const content = readFile("app/api/newsletter/route.ts");
    expect(content).toMatch(/checkRateLimit\(`newsletter:\$\{ip\}`/);
  });

  it("newsletter POST has per-email rate limit with hashed email", () => {
    const content = readFile("app/api/newsletter/route.ts");
    expect(content).toContain("hashEmailForRateLimit");
    expect(content).toContain("newsletter:cooldown:");
  });

  it("newsletter POST verifies Turnstile captcha", () => {
    const content = readFile("app/api/newsletter/route.ts");
    expect(content).toContain("verifyTurnstile");
  });

  it("newsletter POST fails closed without RESEND_API_KEY in production", () => {
    const content = readFile("app/api/newsletter/route.ts");
    expect(content).toContain("RESEND_API_KEY");
    expect(content).toContain("503");
  });
});

describe("Rate-limit abuse protection: click tracking", () => {
  it("click tracking has rate limiting", () => {
    const content = readFile("app/api/track/click/route.ts");
    expect(content).toContain("checkRateLimit");
  });

  it("click tracking uses async queue for write amplification protection", () => {
    const content = readFile("app/api/track/click/route.ts");
    // Should use queue-based processing, not direct DB writes
    expect(content).toMatch(/CLICK_QUEUE|queue|enqueue/i);
  });
});

describe("Rate-limit abuse protection: login endpoint", () => {
  it("login has IP-based rate limit (tight)", () => {
    const content = readFile("app/api/auth/login/route.ts");
    // Must have 3 attempts per 15 min per IP
    expect(content).toContain("maxRequests: 3");
  });

  it("login has per-email rate limit", () => {
    const content = readFile("app/api/auth/login/route.ts");
    expect(content).toContain("hashEmailForRateLimit");
    expect(content).toContain("login-email:");
  });

  it("login has TOTP brute-force protection", () => {
    const content = readFile("app/api/auth/login/route.ts");
    expect(content).toContain("login-totp:");
    expect(content).toContain('failPolicy: "closed"');
  });

  // C-2: Removed misleading skipped test that claimed Turnstile was
  // "temporarily removed." Turnstile is active on checkout, newsletter,
  // and comments routes. Login uses rate-limiting + TOTP as its defence.
});

describe("Rate-limit abuse protection: community endpoints", () => {
  it("comments POST has IP + email rate limiting", () => {
    const content = readFile("app/api/community/comments/route.ts");
    expect(content).toContain("checkRateLimit");
    expect(content).toContain("hashEmailForRateLimit");
  });

  it("comments POST verifies Turnstile", () => {
    const content = readFile("app/api/community/comments/route.ts");
    expect(content).toContain("verifyTurnstile");
  });

  it("comments POST sanitizes HTML", () => {
    const content = readFile("app/api/community/comments/route.ts");
    expect(content).toContain("sanitizeHtml");
  });

  it("wrist-shots POST has rate limiting", () => {
    const content = readFile("app/api/community/wrist-shots/route.ts");
    expect(content).toContain("checkRateLimit");
  });
});
