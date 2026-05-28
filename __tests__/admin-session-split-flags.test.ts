/**
 * SEC-CRIT-04 (deep-audit): Per-control admin-session hardening flags.
 *
 * Each hardening control reads its own env var with `ADMIN_SESSION_STRICT`
 * as the umbrella default. A single typo on the umbrella must NOT silently
 * disable three independent defences. Individual flags must override the
 * umbrella value when set explicitly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("SEC-CRIT-04: per-control admin-session flags", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("umbrella ADMIN_SESSION_STRICT=true enforces UA/IP binding (defaults all flags on)", async () => {
    const sharedSecret = "shared-test-jwt-secret-for-binding-test-at-least-32-chars";
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    const { createToken } = await import("@/lib/auth");
    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const token = await createToken(payload); // no request → no bnd claim

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("ADMIN_SESSION_STRICT", "true");
    // No per-control override → must inherit umbrella → must reject
    vi.resetModules();
    const { verifyToken: verifyProd } = await import("@/lib/auth");
    expect(await verifyProd(token)).toBeNull();
  });

  it("umbrella off + per-control BINDING_STRICT=true still rejects missing bnd (single defence still on)", async () => {
    const sharedSecret = "shared-test-jwt-secret-for-binding-test-at-least-32-chars";
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    const { createToken } = await import("@/lib/auth");
    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const token = await createToken(payload);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("ADMIN_SESSION_STRICT", ""); // explicitly empty (umbrella OFF)
    vi.stubEnv("ADMIN_SESSION_BINDING_STRICT", "true");
    vi.resetModules();
    const { verifyToken: verifyProd } = await import("@/lib/auth");
    expect(await verifyProd(token)).toBeNull();
  });

  it("umbrella on + per-control BINDING_STRICT=false explicitly disables only that defence", async () => {
    const sharedSecret = "shared-test-jwt-secret-for-binding-test-at-least-32-chars";
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    const { createToken } = await import("@/lib/auth");
    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const token = await createToken(payload);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("ADMIN_SESSION_STRICT", "true");
    vi.stubEnv("ADMIN_SESSION_BINDING_STRICT", "false");
    // Token revocation also depends on KV — disable it independently for
    // this assertion since the test environment has no KV binding (the
    // umbrella would normally turn it on).
    vi.stubEnv("ADMIN_SESSION_TOKEN_REVOCATION_STRICT", "false");
    vi.resetModules();
    const { verifyToken: verifyProd } = await import("@/lib/auth");
    // Binding control off → token without bnd is accepted
    expect(await verifyProd(token)).not.toBeNull();
  });

  it("umbrella on + per-control TOKEN_REVOCATION_STRICT=false skips KV check", async () => {
    const sharedSecret = "shared-test-jwt-secret-for-binding-test-at-least-32-chars";
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("NODE_ENV", "test");
    vi.resetModules();
    const { createToken } = await import("@/lib/auth");
    const payload = { email: "admin@test.com", userId: "u-1", role: "admin" as const };
    const request = new Request("https://example.com/api/auth/login", {
      headers: { "user-agent": "TestBrowser/1.0", "cf-connecting-ip": "192.168.1.100" },
    });
    const token = await createToken(payload, request);

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("JWT_SECRET", sharedSecret);
    vi.stubEnv("ADMIN_SESSION_STRICT", "true");
    vi.stubEnv("ADMIN_SESSION_TOKEN_REVOCATION_STRICT", "false");
    vi.resetModules();
    const { verifyToken: verifyProd } = await import("@/lib/auth");
    expect(await verifyProd(token, request)).not.toBeNull();
  });
});
