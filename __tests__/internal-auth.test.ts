/**
 * Tests for lib/internal-auth.ts — internal API token safety.
 *
 * Verifies that:
 * - The dev fallback is not a well-known static string
 * - getInternalToken returns a real env var when set
 * - getInternalToken throws in production when INTERNAL_API_TOKEN is missing
 */
import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("internal-auth safety", () => {
  it("returns the env var when INTERNAL_API_TOKEN is set", async () => {
    vi.stubEnv("INTERNAL_API_TOKEN", "real-token-abc123");
    vi.stubEnv("NODE_ENV", "development");
    const { getInternalToken } = await import("@/lib/internal-auth");
    expect(getInternalToken()).toBe("real-token-abc123");
  });

  it("dev fallback is not the old predictable string", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.INTERNAL_API_TOKEN;
    const { getInternalToken } = await import("@/lib/internal-auth");
    const token = getInternalToken();
    expect(token).not.toBe("__dev_only_change_me__");
    expect(token.length).toBeGreaterThan(0);
  });

  it("dev fallback is random — different across module reloads", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.INTERNAL_API_TOKEN;

    const mod1 = await import("@/lib/internal-auth");
    const token1 = mod1.getInternalToken();

    vi.resetModules();

    const mod2 = await import("@/lib/internal-auth");
    const token2 = mod2.getInternalToken();

    expect(token1).not.toBe(token2);
  });

  it("throws in production when INTERNAL_API_TOKEN is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    delete process.env.INTERNAL_API_TOKEN;
    const { getInternalToken } = await import("@/lib/internal-auth");
    expect(() => getInternalToken()).toThrowError(/INTERNAL_API_TOKEN/);
  });
});
