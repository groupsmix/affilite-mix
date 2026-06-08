/**
 * SEC-04 / SEC-05 (etap-3):
 *
 *  - SEC-04: JWT iat future-skew rejection must run on BOTH the current-key
 *           and previous-key verification paths.
 *  - SEC-05: When a token carries a `bnd` claim, it MUST always be verified
 *           regardless of `ADMIN_SESSION_BINDING_STRICT` -- the flag only
 *           governs whether tokens MISSING `bnd` are accepted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";

const JWT_AUDIENCE = "affilite-mix-admin";
const JWT_ISSUER = "affilite-mix-auth";

describe("SEC-05: bnd claim is always verified when present", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects mismatched bnd even when ADMIN_SESSION_BINDING_STRICT=false", async () => {
    const sharedSecret = "shared-test-jwt-secret-for-bnd-test-at-least-32-chars-long";
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();

    const { createToken } = await import("@/lib/auth");
    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const mintRequest = new Request("https://example.com/api/auth/login", {
      headers: { "user-agent": "MintBrowser/1.0", "cf-connecting-ip": "192.168.1.100" },
    });
    const token = await createToken(payload, mintRequest);

    // Now verify from a DIFFERENT client (different UA + different IP).
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", sharedSecret);
    // Operator deliberately turns binding-strict off.
    vi.stubEnv("ADMIN_SESSION_BINDING_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_TOKEN_REVOCATION_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_IDLE_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_STRICT", "false");
    vi.resetModules();
    const { verifyToken } = await import("@/lib/auth");

    const replayRequest = new Request("https://example.com/admin", {
      headers: { "user-agent": "AttackerBrowser/1.0", "cf-connecting-ip": "203.0.113.42" },
    });
    // SEC-05: bnd present \u2192 must still be verified \u2192 mismatch \u2192 null
    expect(await verifyToken(token, replayRequest)).toBeNull();
  });

  it("accepts matching bnd when ADMIN_SESSION_BINDING_STRICT=false (same client)", async () => {
    const sharedSecret = "shared-test-jwt-secret-for-bnd-test-at-least-32-chars-long";
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();

    const { createToken } = await import("@/lib/auth");
    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const sameRequest = new Request("https://example.com/api/auth/login", {
      headers: { "user-agent": "SameBrowser/1.0", "cf-connecting-ip": "192.168.1.100" },
    });
    const token = await createToken(payload, sameRequest);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("ADMIN_SESSION_BINDING_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_TOKEN_REVOCATION_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_IDLE_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_STRICT", "false");
    vi.resetModules();
    const { verifyToken } = await import("@/lib/auth");

    // Same UA + same IP \u2192 binding matches \u2192 accepted
    expect(await verifyToken(token, sameRequest)).not.toBeNull();
  });
});

describe("SEC-04: iat future-skew rejected on previous-key verification path", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("rejects a future-iat token signed with the previous JWT secret", async () => {
    const currentSecret = "current-secret-for-iat-skew-test-at-least-32-bytes-long";
    const previousSecret = "previous-secret-for-iat-skew-test-at-least-32-bytes-long";

    // Mint a token with the PREVIOUS secret, with iat far in the future.
    const farFuture = Math.floor(Date.now() / 1000) + 24 * 60 * 60; // +24h
    const token = await new SignJWT({ email: "x@test.com", userId: "u1", role: "admin" })
      .setProtectedHeader({ alg: "HS256", kid: "prev-kid" })
      .setJti("jti-1")
      .setIssuedAt(farFuture)
      .setExpirationTime(farFuture + 60 * 60)
      .setAudience(JWT_AUDIENCE)
      .setIssuer(JWT_ISSUER)
      .sign(new TextEncoder().encode(previousSecret));

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", currentSecret);
    vi.stubEnv("JWT_SECRET_PREVIOUS", previousSecret);
    // F-013: the previous secret is only honored inside a valid 24h rotation
    // window, so the rotation must look freshly started — otherwise the token
    // would be rejected because the previous key is dropped, not because of the
    // iat skew this test is asserting.
    vi.stubEnv("JWT_ROTATION_STARTED_AT", new Date().toISOString());
    // Disable hardening flags so only the iat check is what trips this test.
    vi.stubEnv("ADMIN_SESSION_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_BINDING_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_TOKEN_REVOCATION_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_IDLE_STRICT", "false");
    vi.resetModules();

    const { verifyToken } = await import("@/lib/auth");
    // Previous-key path used to skip the iat skew check; must now reject.
    expect(await verifyToken(token)).toBeNull();
  });
});
