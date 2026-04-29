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
