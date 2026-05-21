import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requireEnvInProduction } from "@/lib/env";

const VAR = "__DEVIN_ENV_TEST_VAR__";

describe("requireEnvInProduction", () => {
  beforeEach(() => {
    delete process.env[VAR];
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    delete process.env[VAR];
    vi.unstubAllEnvs();
  });

  it("returns the env value when it is set", () => {
    process.env[VAR] = "actual-value";
    expect(requireEnvInProduction(VAR, "fallback")).toBe("actual-value");
  });

  it("returns the fallback in development when the var is missing", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(requireEnvInProduction(VAR, "dev-fallback")).toBe("dev-fallback");
  });

  it("returns the fallback during the Next.js build phase even in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    expect(requireEnvInProduction(VAR, "build-fallback")).toBe("build-fallback");
  });

  it("throws in production runtime when the var is missing", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    expect(() => requireEnvInProduction(VAR, "")).toThrow(new RegExp(VAR));
  });

  it("throws in production runtime when the var is whitespace-only", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    process.env[VAR] = "   ";
    expect(() => requireEnvInProduction(VAR, "")).toThrow(new RegExp(VAR));
  });

  it("throws in production runtime even when a fallback is supplied (no silent fallback)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    expect(() => requireEnvInProduction(VAR, "should-not-be-returned")).toThrow(new RegExp(VAR));
  });
});
