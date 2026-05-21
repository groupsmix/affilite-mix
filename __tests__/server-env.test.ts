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
