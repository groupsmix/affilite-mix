/**
 * Tests for auth configuration boot-time guards.
 *
 * Covers:
 *  - Internal API token: missing / fallback-valued / real in prod vs dev.
 *  - JWT secret: missing / set in prod vs dev, no per-process random fallback.
 *  - Resolve-site route: returns 500 when internal auth is misconfigured in
 *    production so it cannot be queried with the documented fallback token.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Snapshot & restore env across tests ───────────────────────

const ENV_KEYS = ["NODE_ENV", "NEXT_PHASE", "INTERNAL_API_TOKEN", "JWT_SECRET"] as const;

function snapshotEnv(): Record<string, string | undefined> {
  const env = process.env as Record<string, string | undefined>;
  const snap: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) snap[k] = env[k];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>) {
  const env = process.env as Record<string, string | undefined>;
  for (const k of ENV_KEYS) {
    if (snap[k] === undefined) {
      delete env[k];
    } else {
      env[k] = snap[k];
    }
  }
}

describe("internal-auth config guard", () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv(snap);
    vi.resetModules();
  });

  it("throws in production when INTERNAL_API_TOKEN is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    delete process.env.INTERNAL_API_TOKEN;

    const mod = await import("@/lib/internal-auth");
    expect(() => mod.getInternalToken()).toThrow(/INTERNAL_API_TOKEN is required/);
    vi.unstubAllEnvs();
  });

  it("throws in production when INTERNAL_API_TOKEN equals the documented dev fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    const mod = await import("@/lib/internal-auth");
    process.env.INTERNAL_API_TOKEN = mod.DEV_FALLBACK_INTERNAL_TOKEN;

    expect(() => mod.getInternalToken()).toThrow(/public dev fallback/);
    vi.unstubAllEnvs();
  });

  it("throws in production when INTERNAL_API_TOKEN is empty/whitespace", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    process.env.INTERNAL_API_TOKEN = "   ";

    const mod = await import("@/lib/internal-auth");
    expect(() => mod.getInternalToken()).toThrow(/INTERNAL_API_TOKEN is required/);
    vi.unstubAllEnvs();
  });

  it("returns the configured token in production when a real value is set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    process.env.INTERNAL_API_TOKEN = "prod-real-secret-abc123";

    const mod = await import("@/lib/internal-auth");
    expect(mod.getInternalToken()).toBe("prod-real-secret-abc123");
    vi.unstubAllEnvs();
  });

  it("returns the documented dev fallback in development when unset", async () => {
    vi.stubEnv("NODE_ENV", "development");
    delete process.env.NEXT_PHASE;
    delete process.env.INTERNAL_API_TOKEN;

    const mod = await import("@/lib/internal-auth");
    expect(mod.getInternalToken()).toBe(mod.DEV_FALLBACK_INTERNAL_TOKEN);
    vi.unstubAllEnvs();
  });

  it("does not throw during Next.js build phase even without a token", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.INTERNAL_API_TOKEN;

    const mod = await import("@/lib/internal-auth");
    expect(() => mod.getInternalToken()).not.toThrow();
    vi.unstubAllEnvs();
  });
});

describe("jwt-secret config guard", () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv(snap);
    vi.resetModules();
  });

  it("throws in production when JWT_SECRET is missing", async () => {
    const { resolveJwtSecret } = await import("@/lib/jwt-secret");
    expect(() => resolveJwtSecret({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(
      /JWT_SECRET is required/,
    );
  });

  it("throws in production when JWT_SECRET is empty/whitespace", async () => {
    const { resolveJwtSecret } = await import("@/lib/jwt-secret");
    expect(() =>
      resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET: "  " } as NodeJS.ProcessEnv),
    ).toThrow(/JWT_SECRET is required/);
  });

  it("returns the configured secret in production when set", async () => {
    const { resolveJwtSecret } = await import("@/lib/jwt-secret");
    expect(
      resolveJwtSecret({
        NODE_ENV: "production",
        JWT_SECRET: "prod-secret-xyz",
      } as NodeJS.ProcessEnv),
    ).toBe("prod-secret-xyz");
  });

  it("returns the documented dev fallback in development when unset", async () => {
    const { resolveJwtSecret, DEV_ONLY_JWT_SECRET, __resetJwtSecretCacheForTests } =
      await import("@/lib/jwt-secret");
    __resetJwtSecretCacheForTests();
    expect(resolveJwtSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(
      DEV_ONLY_JWT_SECRET,
    );
  });

  it("does not throw during Next.js build phase even without JWT_SECRET", async () => {
    const { resolveJwtSecret } = await import("@/lib/jwt-secret");
    expect(() =>
      resolveJwtSecret({
        NODE_ENV: "production",
        NEXT_PHASE: "phase-production-build",
      } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it("dev fallback is a stable constant (no per-process randomness)", async () => {
    const { resolveJwtSecret, __resetJwtSecretCacheForTests } = await import("@/lib/jwt-secret");
    __resetJwtSecretCacheForTests();
    const a = resolveJwtSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    __resetJwtSecretCacheForTests();
    const b = resolveJwtSecret({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(a).toBe(b);
  });
});

describe("/api/internal/resolve-site auth misconfiguration", () => {
  let snap: Record<string, string | undefined>;

  beforeEach(() => {
    snap = snapshotEnv();
    vi.resetModules();
  });

  afterEach(() => {
    restoreEnv(snap);
    vi.resetModules();
  });

  it("returns 500 in production when INTERNAL_API_TOKEN is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    delete process.env.INTERNAL_API_TOKEN;

    const { GET } = await import("@/app/api/internal/resolve-site/route");
    const { DEV_FALLBACK_INTERNAL_TOKEN, INTERNAL_HEADER } = await import("@/lib/internal-auth");
    const req = new NextRequest("https://example.com/api/internal/resolve-site?domain=x.com", {
      headers: { [INTERNAL_HEADER]: DEV_FALLBACK_INTERNAL_TOKEN },
    });
    const res = await GET(req);
    expect(res.status).toBe(500);
    vi.unstubAllEnvs();
  });

  it("returns 500 in production when INTERNAL_API_TOKEN is the dev fallback", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    const { DEV_FALLBACK_INTERNAL_TOKEN, INTERNAL_HEADER } = await import("@/lib/internal-auth");
    process.env.INTERNAL_API_TOKEN = DEV_FALLBACK_INTERNAL_TOKEN;

    const { GET } = await import("@/app/api/internal/resolve-site/route");
    const req = new NextRequest("https://example.com/api/internal/resolve-site?domain=x.com", {
      headers: { [INTERNAL_HEADER]: DEV_FALLBACK_INTERNAL_TOKEN },
    });
    const res = await GET(req);
    // Misconfigured → 500, NOT 200/403 based on the public fallback.
    expect(res.status).toBe(500);
    vi.unstubAllEnvs();
  });

  it("rejects requests sending the dev fallback token when a real token is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.NEXT_PHASE;
    process.env.INTERNAL_API_TOKEN = "prod-real-secret-abc123";

    const { GET } = await import("@/app/api/internal/resolve-site/route");
    const { DEV_FALLBACK_INTERNAL_TOKEN, INTERNAL_HEADER } = await import("@/lib/internal-auth");
    const req = new NextRequest("https://example.com/api/internal/resolve-site?domain=x.com", {
      headers: { [INTERNAL_HEADER]: DEV_FALLBACK_INTERNAL_TOKEN },
    });
    const res = await GET(req);
    expect(res.status).toBe(403);
    vi.unstubAllEnvs();
  });
});
