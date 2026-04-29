/**
 * P0-1: Integration test for the admin auth binding flow.
 *
 * Verifies that:
 *  1. createToken with a request embeds the bnd claim
 *  2. Refreshed tokens preserve binding when request is passed
 *  3. verifyToken rejects tokens without bnd in production
 *  4. verifyToken rejects tokens with mismatched binding
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("P0-1: Auth binding lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("createToken embeds bnd claim when request is provided", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const fakeRequest = new Request("https://example.com/api/auth/login", {
      headers: {
        "user-agent": "TestBrowser/1.0",
        "cf-connecting-ip": "192.168.1.100",
      },
    });

    const token = await createToken(payload, fakeRequest);
    const decoded = await verifyToken(token, fakeRequest);

    expect(decoded).not.toBeNull();
    expect(decoded?.bnd).toBeTruthy();
    expect(decoded?.email).toBe("admin@test.com");
  });

  it("createToken without request does NOT embed bnd claim", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const token = await createToken(payload);
    const decoded = await verifyToken(token);

    expect(decoded).not.toBeNull();
    expect(decoded?.bnd).toBeUndefined();
  });

  it("verifyToken rejects tokens without bnd in production", async () => {
    // Set the JWT secret explicitly BEFORE creating the token so both
    // creation and verification use the same key. The test must prove
    // rejection is due to the missing bnd claim, not a key mismatch.
    const sharedSecret = "shared-test-jwt-secret-for-binding-test-at-least-32-chars";
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();

    const { createToken } = await import("@/lib/auth");
    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const token = await createToken(payload); // no request = no bnd

    // Switch to production and re-import for verification with the SAME secret
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.resetModules();

    const { verifyToken: verifyProd } = await import("@/lib/auth");
    const decoded = await verifyProd(token);

    // Should be null because production requires bnd claim
    expect(decoded).toBeNull();
  });

  it("verifyToken rejects tokens with mismatched binding", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const loginRequest = new Request("https://example.com/api/auth/login", {
      headers: {
        "user-agent": "OriginalBrowser/1.0",
        "cf-connecting-ip": "192.168.1.100",
      },
    });

    const token = await createToken(payload, loginRequest);

    // Verify with a different user-agent (simulates stolen token replay)
    const replayRequest = new Request("https://example.com/api/admin/something", {
      headers: {
        "user-agent": "AttackerBrowser/2.0",
        "cf-connecting-ip": "10.0.0.1",
      },
    });

    const decoded = await verifyToken(token, replayRequest);
    expect(decoded).toBeNull();
  });

  it("refreshed token preserves binding when request is passed", async () => {
    const { createToken, verifyToken } = await import("@/lib/auth");

    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const request = new Request("https://example.com/api/auth/refresh", {
      headers: {
        "user-agent": "TestBrowser/1.0",
        "cf-connecting-ip": "192.168.1.100",
      },
    });

    // Simulate login: create token with binding
    const loginToken = await createToken(payload, request);
    const loginDecoded = await verifyToken(loginToken, request);
    expect(loginDecoded?.bnd).toBeTruthy();

    // Simulate refresh: create new token from decoded session + request
    const refreshToken = await createToken(
      { email: loginDecoded!.email, userId: loginDecoded!.userId, role: loginDecoded!.role },
      request,
    );
    const refreshDecoded = await verifyToken(refreshToken, request);

    expect(refreshDecoded).not.toBeNull();
    expect(refreshDecoded?.bnd).toBeTruthy();
    expect(refreshDecoded?.bnd).toBe(loginDecoded?.bnd);
  });
});
