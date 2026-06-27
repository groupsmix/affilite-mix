/**
 * R2 (audit-fix-verification): Test JWT audience matches server expectation.
 *
 * The server's `verifyToken` (lib/auth.ts) pins the accepted JWT audience
 * (`aud`) claim to exactly "affilite-mix-admin". These unit tests confirm:
 *
 *   - 2.2 A token whose `aud` equals exactly "affilite-mix-admin" is accepted
 *         and the decoded admin payload is returned (login flow proceeds).
 *   - 2.3 A token whose `aud` is any other value is rejected (null) — no
 *         session is established.
 *   - 2.4 A token with a missing or empty `aud` claim is rejected (null) — no
 *         session is established.
 *
 * Tokens are minted with `jose` (the library the codebase already uses) so we
 * can vary the audience independently of the rest of the claim set. The HS256
 * signing key matches the server's resolved secret (JWT_SECRET), and the
 * issuer is set to the server-expected value so that audience is the only
 * variable under test.
 *
 * _Requirements: 2.2, 2.3, 2.4_
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SignJWT } from "jose";

const EXPECTED_AUDIENCE = "affilite-mix-admin";
const EXPECTED_ISSUER = "affilite-mix-auth";
const SHARED_SECRET = "shared-test-jwt-secret-for-audience-tests-at-least-32-chars";

/**
 * Mint an HS256 admin JWT with a controllable audience. When `audience` is
 * undefined the `aud` claim is omitted entirely; otherwise it is set to the
 * given value (including the empty string).
 */
async function mintToken(audience: string | undefined): Promise<string> {
  let builder = new SignJWT({ email: "admin@test.com", userId: "u-1", role: "admin" })
    .setProtectedHeader({ alg: "HS256", kid: "test-kid" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setIssuer(EXPECTED_ISSUER);

  if (audience !== undefined) {
    builder = builder.setAudience(audience);
  }

  return builder.sign(new TextEncoder().encode(SHARED_SECRET));
}

describe("R2: verifyToken audience acceptance/rejection", () => {
  beforeEach(() => {
    // Sign and verify with the same secret. Disable the revocation/floor
    // control so the test never reaches KV — audience is the only behavior
    // under test here.
    vi.stubEnv("JWT_SECRET", SHARED_SECRET);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ADMIN_SESSION_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_TOKEN_REVOCATION_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_BINDING_STRICT", "false");
    vi.stubEnv("ADMIN_SESSION_IDLE_STRICT", "false");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("2.2 accepts a token whose aud equals exactly 'affilite-mix-admin'", async () => {
    const { verifyToken } = await import("@/lib/auth");
    const token = await mintToken(EXPECTED_AUDIENCE);

    const decoded = await verifyToken(token);

    // Accepted → admin payload returned so the login flow can proceed.
    expect(decoded).not.toBeNull();
    expect(decoded?.email).toBe("admin@test.com");
    expect(decoded?.role).toBe("admin");
  }, 30000);

  it("2.3 rejects a token whose aud is any other value (no session)", async () => {
    const { verifyToken } = await import("@/lib/auth");
    const token = await mintToken("some-other-audience");

    const decoded = await verifyToken(token);

    expect(decoded).toBeNull();
  }, 30000);

  it("2.3 rejects a token whose aud is a near-miss of the expected value", async () => {
    const { verifyToken } = await import("@/lib/auth");
    const token = await mintToken("affilite-mix-admin-extra");

    const decoded = await verifyToken(token);

    expect(decoded).toBeNull();
  }, 30000);

  it("2.4 rejects a token that omits the aud claim (no session)", async () => {
    const { verifyToken } = await import("@/lib/auth");
    const token = await mintToken(undefined);

    const decoded = await verifyToken(token);

    expect(decoded).toBeNull();
  }, 30000);

  it("2.4 rejects a token with an empty aud claim (no session)", async () => {
    const { verifyToken } = await import("@/lib/auth");
    const token = await mintToken("");

    const decoded = await verifyToken(token);

    expect(decoded).toBeNull();
  }, 30000);
});
