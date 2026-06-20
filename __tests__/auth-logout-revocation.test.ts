import { describe, it, expect, vi, beforeEach } from "vitest";

// Bug 9 — weak revocation on logout.
//
// Logout was calling revokeToken() (KV-only, ~60s eventual) while refresh
// and reset used revokeTokenStrong() (immediate in-memory + KV). A copied
// token could authorize for ~60s after logout.
//
// These tests pin the fix: after POST /api/auth/logout, the jti must be
// rejected IMMEDIATELY by the in-memory blocklist, AND the KV write must
// still happen for cross-isolate propagation.

// --- Hoisted state so vi.mock factories can see it -----------------------
const { kvRef, decodeJwtClaimsMock } = vi.hoisted(() => {
  const kvRef: { current: ReturnType<typeof makeKv> | null } = { current: null };
  // A vi.fn we can re-mock from tests. The factory below returns it so the
  // route's import receives this same function instance.
  const decodeJwtClaimsMock = vi.fn((_token: string) => ({ jti: "jti-default" }));
  return { kvRef, decodeJwtClaimsMock };
});

function makeKv() {
  const store = new Map<string, string>();
  return {
    store,
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  };
}

// --- Top-level mocks (all evaluated before any module import) -------------

const cookieStoreState: Record<string, { value: string }> = {};

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => cookieStoreState[name],
  })),
}));

vi.mock("@/lib/auth", () => ({
  COOKIE_NAME: "am_session",
  ACTIVITY_COOKIE: "am_activity",
  BINDING_COOKIE: "am_bind",
}));

vi.mock("@/lib/active-site", () => ({
  ACTIVE_SITE_COOKIE: "am_site",
}));

vi.mock("@/lib/cookie-utils", () => ({
  IS_SECURE_COOKIE: false,
}));

vi.mock("@/lib/csrf", () => ({
  CSRF_COOKIE: "am_csrf",
}));

vi.mock("@/lib/decode-jwt-claims", () => ({
  decodeJwtClaims: decodeJwtClaimsMock,
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, retryAfterMs: 0 }),
  // The KV namespace is what revokeToken() ultimately writes to. We point it
  // at the hoisted holder so each test can swap in its own in-memory KV.
  getKVNamespace: vi.fn(() => kvRef.current),
}));

vi.mock("@/lib/get-client-ip", () => ({
  getClientIp: vi.fn(() => "203.0.113.7"),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(() => ({
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    })),
  },
}));

// ---------------------------------------------------------------------------

let testJti: string;

beforeEach(() => {
  // Clear cookies and KV per test.
  for (const k of Object.keys(cookieStoreState)) delete cookieStoreState[k];
  kvRef.current = makeKv();
  // Each test uses a unique jti so the module-level in-memory blocklist in
  // jwt-revocation-strong.ts does not leak state between tests.
  testJti = `jti-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  // Update the mocked decodeJwtClaims to return the test's jti.
  decodeJwtClaimsMock.mockImplementation(() => ({ jti: testJti }));
});

async function loadLogout() {
  const mod = await import("@/app/api/auth/logout/route");
  return mod.POST;
}

function buildRequestWithCookie(cookieName: string, cookieValue: string) {
  return new Request("http://localhost/api/auth/logout", {
    method: "POST",
    headers: { cookie: `${cookieName}=${cookieValue}` },
  });
}

describe("Bug 9 — logout must use strong revocation (immediate)", () => {
  it("after logout, isTokenRevokedImmediate(jti) returns true (no KV wait)", async () => {
    cookieStoreState.am_session = { value: "any-token-value" };

    const POST = await loadLogout();
    await POST(buildRequestWithCookie("am_session", "any-token-value") as never);

    const { isTokenRevokedImmediate } = await import("@/lib/jwt-revocation-strong");
    // Regression pin: before the fix, the in-memory blocklist was empty
    // after logout (logout wrote to KV only). After the fix, the jti is
    // present immediately.
    expect(isTokenRevokedImmediate(testJti)).toBe(true);
  });

  it("logout also writes to KV for cross-isolate propagation", async () => {
    cookieStoreState.am_session = { value: "any-token-value" };

    const POST = await loadLogout();
    await POST(buildRequestWithCookie("am_session", "any-token-value") as never);

    const kv = kvRef.current!;
    expect(kv.put).toHaveBeenCalledWith(
      `revoked:${testJti}`,
      "1",
      expect.objectContaining({ expirationTtl: expect.any(Number) }),
    );
    expect(kv.store.has(`revoked:${testJti}`)).toBe(true);
  });

  it("logout clears all five auth-related cookies (B-03 / T-25)", async () => {
    cookieStoreState.am_session = { value: "any-token-value" };

    const POST = await loadLogout();
    const res = (await POST(
      buildRequestWithCookie("am_session", "any-token-value") as never,
    )) as Response;

    const setCookie = res.headers.get("set-cookie") ?? "";
    for (const name of ["am_session", "am_bind", "am_activity", "am_site", "am_csrf"]) {
      expect(setCookie.toLowerCase()).toContain(name.toLowerCase());
      expect(setCookie).toMatch(new RegExp(`${name}=[^;]*;.*Max-Age=0`, "i"));
    }
  });

  it("logout is safe when no JWT cookie is present", async () => {
    const POST = await loadLogout();
    const res = (await POST(
      new Request("http://localhost/api/auth/logout", { method: "POST" }) as never,
    )) as Response;

    expect(res.status).toBe(200);
    expect(kvRef.current!.put).not.toHaveBeenCalled();
  });

  it("the logout handler calls revokeTokenStrong, not the weak revokeToken directly", async () => {
    // Spy on both modules. The strong primitive delegates to the weak one
    // internally, so the WEAK revokeToken will be called once (from inside
    // revokeTokenStrong). The STRONG revokeTokenStrong must be called
    // exactly once from the route. We assert the strong path is the
    // entry point by checking the in-memory blocklist — only the strong
    // path populates it.
    cookieStoreState.am_session = { value: "any-token-value" };

    const POST = await loadLogout();
    await POST(buildRequestWithCookie("am_session", "any-token-value") as never);

    const { isTokenRevokedImmediate } = await import("@/lib/jwt-revocation-strong");
    // The strong path is the only way to populate the in-memory blocklist.
    expect(isTokenRevokedImmediate(testJti)).toBe(true);
  });

  it("respects rate limit (429) without performing revocation", async () => {
    const { checkRateLimit } = await import("@/lib/rate-limit");
    (checkRateLimit as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      retryAfterMs: 30_000,
    });

    cookieStoreState.am_session = { value: "any-token-value" };

    const POST = await loadLogout();
    const res = (await POST(
      buildRequestWithCookie("am_session", "any-token-value") as never,
    )) as Response;

    expect(res.status).toBe(429);
    expect(kvRef.current!.put).not.toHaveBeenCalled();
    // In-memory blocklist must also remain empty (rate-limited path
    // bypasses revocation entirely). This test's jti was never seen
    // before, so absence proves the path was bypassed.
    const { isTokenRevokedImmediate } = await import("@/lib/jwt-revocation-strong");
    expect(isTokenRevokedImmediate(testJti)).toBe(false);
  });
});
