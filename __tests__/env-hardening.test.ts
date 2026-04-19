/**
 * Tests for lib/env.ts — production environment variable hardening.
 *
 * Verifies that requireEnvInProduction:
 * - Returns the env var when set
 * - Returns the fallback in development / build phases
 * - Throws in production runtime when the variable is missing
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { requireEnvInProduction } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("requireEnvInProduction", () => {
  it("returns the environment variable when it is set", () => {
    vi.stubEnv("MY_VAR", "real-value");
    expect(requireEnvInProduction("MY_VAR", "fallback")).toBe("real-value");
  });

  it("treats empty strings as missing", () => {
    vi.stubEnv("MY_VAR", "   ");
    vi.stubEnv("NODE_ENV", "development");
    expect(requireEnvInProduction("MY_VAR", "fallback")).toBe("fallback");
  });

  it("returns fallback in development when env var is missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.MISSING_VAR;
    expect(requireEnvInProduction("MISSING_VAR", "dev-default")).toBe("dev-default");
  });

  it("returns fallback during next build phase even in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    delete process.env.BUILD_VAR;
    expect(requireEnvInProduction("BUILD_VAR", "build-fallback")).toBe("build-fallback");
  });

  it("throws in production runtime when env var is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    delete process.env.CRITICAL_SECRET;
    expect(() => requireEnvInProduction("CRITICAL_SECRET", "unsafe-default")).toThrowError(
      /CRITICAL_SECRET is missing or empty in production/,
    );
  });

  it("throws in production runtime when env var is empty", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    vi.stubEnv("EMPTY_SECRET", "");
    expect(() => requireEnvInProduction("EMPTY_SECRET", "unsafe-default")).toThrowError(
      /EMPTY_SECRET is missing or empty in production/,
    );
  });

  it("error message includes remediation hint", () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    delete process.env.JWT_SECRET;
    expect(() => requireEnvInProduction("JWT_SECRET", "x")).toThrowError(/wrangler secret put/);
  });
});
