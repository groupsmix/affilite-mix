/**
 * P0-3: Env validation test that blocks deploy if required signing secrets
 * are absent.
 *
 * INTERNAL_API_TOKEN is used for HMAC signing of cached affiliate payloads.
 * Without it, the click route cannot sign cached data, creating a cache
 * poisoning vector.
 */
import { describe, it, expect } from "vitest";
import { REQUIRED_SERVER_ENV } from "@/lib/server-env";
import { checkRotationWindowExpiry } from "@/lib/jwt-secret";

describe("P0-3: Required signing secrets in env registry", () => {
  it("INTERNAL_API_TOKEN is in REQUIRED_SERVER_ENV", () => {
    const names = REQUIRED_SERVER_ENV.map((e) => e.name);
    expect(names).toContain("INTERNAL_API_TOKEN");
  });

  it("JWT_SECRET is in REQUIRED_SERVER_ENV", () => {
    const names = REQUIRED_SERVER_ENV.map((e) => e.name);
    expect(names).toContain("JWT_SECRET");
  });

  it("SUPABASE_JWT_SECRET is in REQUIRED_SERVER_ENV", () => {
    const names = REQUIRED_SERVER_ENV.map((e) => e.name);
    expect(names).toContain("SUPABASE_JWT_SECRET");
  });

  it("all required env vars have descriptions and ownerFiles", () => {
    for (const env of REQUIRED_SERVER_ENV) {
      expect(env.description).toBeTruthy();
      expect(env.ownerFile).toBeTruthy();
    }
  });
});

describe("AUD-09: JWT rotation window enforcement", () => {
  it("returns null when JWT_SECRET_PREVIOUS is not set", () => {
    const env = { JWT_SECRET_PREVIOUS: "" } as unknown as NodeJS.ProcessEnv;
    expect(checkRotationWindowExpiry(env)).toBeNull();
  });

  it("returns error when JWT_SECRET_PREVIOUS is set but JWT_ROTATION_STARTED_AT is missing", () => {
    const env = {
      JWT_SECRET_PREVIOUS: "old-secret",
    } as unknown as NodeJS.ProcessEnv;
    const result = checkRotationWindowExpiry(env);
    expect(result).toContain("JWT_ROTATION_STARTED_AT is missing");
  });

  it("returns null when rotation started within 24h", () => {
    const env = {
      JWT_SECRET_PREVIOUS: "old-secret",
      JWT_ROTATION_STARTED_AT: new Date().toISOString(),
    } as unknown as NodeJS.ProcessEnv;
    expect(checkRotationWindowExpiry(env)).toBeNull();
  });

  it("returns error when rotation started more than 24h ago", () => {
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const env = {
      JWT_SECRET_PREVIOUS: "old-secret",
      JWT_ROTATION_STARTED_AT: old,
    } as unknown as NodeJS.ProcessEnv;
    const result = checkRotationWindowExpiry(env);
    expect(result).toContain("exceeding the 24h rotation window");
  });

  it("returns error when JWT_ROTATION_STARTED_AT is not a valid ISO-8601 timestamp", () => {
    const env = {
      JWT_SECRET_PREVIOUS: "old-secret",
      JWT_ROTATION_STARTED_AT: "not-a-date",
    } as unknown as NodeJS.ProcessEnv;
    const result = checkRotationWindowExpiry(env);
    expect(result).toContain("not a valid ISO-8601 timestamp");
  });
});
