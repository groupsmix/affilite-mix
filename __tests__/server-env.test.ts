import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  REQUIRED_SERVER_ENV,
  RECOMMENDED_SERVER_ENV,
  collectMissingEnv,
  validateServerEnv,
  formatMissingEnvMessage,
} from "@/lib/server-env";

describe("server-env canonical list", () => {
  it("includes every required prod env var from the spec", () => {
    const names = REQUIRED_SERVER_ENV.map((e) => e.name);
    for (const expected of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "JWT_SECRET",
      "INTERNAL_API_TOKEN",
      "CRON_SECRET",
      "SENTRY_DSN",
    ]) {
      expect(names).toContain(expected);
    }
  });

  it("every required var declares an owner file and description", () => {
    for (const entry of REQUIRED_SERVER_ENV) {
      expect(entry.ownerFile).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });

  it("recommended vars are disjoint from required vars", () => {
    const required = new Set(REQUIRED_SERVER_ENV.map((e) => e.name));
    for (const rec of RECOMMENDED_SERVER_ENV) {
      expect(required.has(rec.name)).toBe(false);
    }
  });
});

describe("collectMissingEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports a var as missing when unset", () => {
    vi.stubEnv("JWT_SECRET", "");
    const missing = collectMissingEnv(REQUIRED_SERVER_ENV);
    expect(missing.some((e) => e.name === "JWT_SECRET")).toBe(true);
  });

  it("reports a var as missing when whitespace-only", () => {
    vi.stubEnv("JWT_SECRET", "   ");
    const missing = collectMissingEnv(REQUIRED_SERVER_ENV);
    expect(missing.some((e) => e.name === "JWT_SECRET")).toBe(true);
  });

  it("does not report a var that is set to a real value", () => {
    vi.stubEnv("JWT_SECRET", "a-real-secret");
    const missing = collectMissingEnv(REQUIRED_SERVER_ENV);
    expect(missing.some((e) => e.name === "JWT_SECRET")).toBe(false);
  });
});

describe("validateServerEnv", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns separate buckets for required and recommended misses", () => {
    // Force everything required to be missing
    for (const entry of REQUIRED_SERVER_ENV) {
      vi.stubEnv(entry.name, "");
    }
    for (const entry of RECOMMENDED_SERVER_ENV) {
      vi.stubEnv(entry.name, "");
    }
    const { missing, missingRecommended } = validateServerEnv();
    expect(missing.length).toBe(REQUIRED_SERVER_ENV.length);
    expect(missingRecommended.length).toBe(RECOMMENDED_SERVER_ENV.length);
  });
});

describe("ETAP1-13: ALLOW_LOCALHOST_FALLBACK_IN_PROD production guard", () => {
  it("instrumentation.ts contains the ALLOW_LOCALHOST_FALLBACK_IN_PROD guard", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.resolve(__dirname, "..", "instrumentation.ts"), "utf-8");
    expect(src).toContain("ALLOW_LOCALHOST_FALLBACK_IN_PROD");
    expect(src).toContain("Refusing to start");
  });

  it("guard rejects public APP_URL with ALLOW_LOCALHOST_FALLBACK_IN_PROD=1", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.resolve(__dirname, "..", "instrumentation.ts"), "utf-8");
    // The guard must check NODE_ENV === "production" AND the env var is "1"
    // AND APP_URL is not localhost — then throw.
    expect(src).toContain('process.env.ALLOW_LOCALHOST_FALLBACK_IN_PROD === "1"');
    expect(src).toContain('process.env.NODE_ENV === "production"');
    expect(src).toMatch(/isLocalhost[\s\S]*localhost/);
    expect(src).toContain("throw new Error");
  });
});

describe("formatMissingEnvMessage", () => {
  it("mentions every missing variable by name", () => {
    const msg = formatMissingEnvMessage(
      [...REQUIRED_SERVER_ENV],
      "MISSING REQUIRED ENVIRONMENT VARIABLES",
    );
    for (const entry of REQUIRED_SERVER_ENV) {
      expect(msg).toContain(entry.name);
    }
    expect(msg).toContain("MISSING REQUIRED ENVIRONMENT VARIABLES");
  });
});

describe("F-005: production Turnstile guard", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const turnstileGuardTripped = () =>
    validateServerEnv().missing.some((e) => e.name === "ENABLE_TURNSTILE");

  it("fails in production when Turnstile is explicitly disabled without acknowledgement", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_TURNSTILE", "false");
    vi.stubEnv("ALLOW_TURNSTILE_DISABLED_IN_PROD", "");
    expect(turnstileGuardTripped()).toBe(true);
  });

  it("also trips when ENABLE_TURNSTILE=0 in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_TURNSTILE", "0");
    expect(turnstileGuardTripped()).toBe(true);
  });

  it("passes when the disable is consciously acknowledged", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_TURNSTILE", "false");
    vi.stubEnv("ALLOW_TURNSTILE_DISABLED_IN_PROD", "1");
    expect(turnstileGuardTripped()).toBe(false);
  });

  it("does not trip when Turnstile is enabled in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_TURNSTILE", "true");
    expect(turnstileGuardTripped()).toBe(false);
  });

  it("does not trip when ENABLE_TURNSTILE is unset (RISK-16 prod default is ON)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_TURNSTILE", "");
    expect(turnstileGuardTripped()).toBe(false);
  });

  it("never trips outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_TURNSTILE", "false");
    expect(turnstileGuardTripped()).toBe(false);
  });
});
