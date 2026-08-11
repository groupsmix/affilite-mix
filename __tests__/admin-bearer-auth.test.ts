/**
 * Machine access to /api/admin/* through `Authorization: Bearer <admin api token>`.
 *
 * The browser session cookie is bound to the client's UA/IP and expires after
 * 30 minutes of inactivity, so a non-browser client cannot hold one. These
 * tests pin the bearer path: which credentials are accepted, which tenant the
 * caller lands on, and that a bearer request is not blocked by CSRF.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const SITE_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SITE_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const requestHeaders = new Headers();
const recordAuditEvent = vi.fn().mockResolvedValue(undefined);
let cookieSession: {
  userId: string;
  email: string;
  role: "admin" | "super_admin";
} | null = null;
let activeSiteSlug: string | null = null;

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => requestHeaders,
}));

vi.mock("@/lib/auth", () => ({
  getAdminSession: async () => cookieSession,
  AdminPayload: {},
}));

vi.mock("@/lib/active-site", () => ({
  getActiveSiteSlug: async () => activeSiteSlug,
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true, remaining: 99, retryAfterMs: 0 })),
}));

vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: async (slug: string) => {
    const map: Record<string, string> = { "watch-tools": SITE_A_ID, "crypto-tools": SITE_B_ID };
    const id = map[slug];
    if (!id) throw new Error(`Site not found: ${slug}`);
    return id;
  },
}));

vi.mock("@/lib/dal/sites", () => ({
  getSiteRowBySlugWithClient: async () => null,
  getSiteRowById: async (id: string) =>
    id === SITE_B_ID ? { id: SITE_B_ID, slug: "crypto-tools" } : null,
}));

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/runtime-env", () => ({ getAppCacheKV: () => undefined }));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

vi.mock("@/lib/dal/admin-site-memberships", () => ({
  getAdminSiteMembership: async () => null,
}));

interface TokenRow {
  id: string;
  site_id: string | null;
  created_by: string;
  is_active: boolean;
  expires_at: string;
}

let tokenRow: TokenRow | null = null;
let adminUser: {
  id: string;
  email: string;
  role: "admin" | "super_admin";
  is_active: boolean;
} | null = null;
const touchAdminApiToken = vi.fn(async () => undefined);

vi.mock("@/lib/dal/admin-api-tokens", () => ({
  // The route hashes the presented token; the fixture ignores the hash and
  // returns whatever the test configured.
  getAdminApiTokenByHash: async () => tokenRow,
  isAdminApiTokenValid: async (row: TokenRow | null) =>
    !!row && row.is_active && new Date(row.expires_at) > new Date(),
  touchAdminApiToken,
}));

vi.mock("@/lib/dal/admin-users", () => ({
  getAdminUserById: async () => adminUser,
}));

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const PAST = new Date(Date.now() - 1_000).toISOString();

function setBearer(token: string | null): void {
  requestHeaders.delete("authorization");
  if (token) requestHeaders.set("authorization", `Bearer ${token}`);
}

describe("admin bearer authentication", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_SITE", "watch-tools");
    requestHeaders.delete("authorization");
    requestHeaders.delete("x-admin-site");
    cookieSession = null;
    activeSiteSlug = null;
    recordAuditEvent.mockClear();
    touchAdminApiToken.mockClear();
    tokenRow = {
      id: "tok-1",
      site_id: null,
      created_by: "user-super",
      is_active: true,
      expires_at: FUTURE,
    };
    adminUser = { id: "user-super", email: "super@test.com", role: "super_admin", is_active: true };
  });

  it("authenticates an all-sites token and falls back to the default site", async () => {
    setBearer("aadm_valid");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).toBeNull();
    expect(result.session?.email).toBe("super@test.com");
    expect(result.siteSlug).toBe("watch-tools");
    expect(result.dbSiteId).toBe(SITE_A_ID);
    expect(touchAdminApiToken).toHaveBeenCalledWith("tok-1");
  });

  it("returns the machine discriminator and denies sensitive routes with an audit event", async () => {
    setBearer("aadm_valid");
    const { requireAdmin } = await import("@/lib/admin-guard");
    const deniedPaths = [
      "/api/admin/users",
      "/api/admin/api-tokens",
      "/api/admin/permissions",
      "/api/admin/sites",
      "/api/admin/automation/service-accounts",
      "/api/admin/integrations",
      "/api/admin/affiliate-networks",
      "/api/admin/privacy/user",
      "/api/admin/users/me/password",
    ];
    for (const pathname of deniedPaths) {
      const result = await requireAdmin(new NextRequest(`http://localhost${pathname}`));
      expect(result.error?.status, pathname).toBe(403);
      expect(result.caller, pathname).toBeNull();
    }
    expect(recordAuditEvent).toHaveBeenCalledTimes(deniedPaths.length);
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "admin.machine_access_denied",
        details: expect.objectContaining({
          token_id: "tok-1",
          reason: "machine_caller_not_permitted",
        }),
      }),
    );
  });

  it("keeps browser sessions allowed on sensitive routes and bearer access open on products", async () => {
    cookieSession = {
      userId: "user-super",
      email: "super@test.com",
      role: "super_admin",
    };
    activeSiteSlug = "watch-tools";
    const { requireAdmin } = await import("@/lib/admin-guard");
    const browser = await requireAdmin(
      new NextRequest("http://localhost/api/admin/users", { method: "GET" }),
    );
    expect(browser.error).toBeNull();
    expect(browser.caller).toEqual({ type: "interactive" });

    cookieSession = null;
    setBearer("aadm_valid");
    const machine = await requireAdmin(
      new NextRequest("http://localhost/api/admin/products", { method: "GET" }),
    );
    expect(machine.error).toBeNull();
    expect(machine.caller).toEqual({ type: "machine", tokenId: "tok-1" });
  });

  it("honours the x-admin-site header for an all-sites token", async () => {
    setBearer("aadm_valid");
    requestHeaders.set("x-admin-site", "crypto-tools");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).toBeNull();
    expect(result.siteSlug).toBe("crypto-tools");
    expect(result.dbSiteId).toBe(SITE_B_ID);
  });

  it("pins a site-bound token to its own tenant, ignoring x-admin-site", async () => {
    tokenRow = {
      id: "tok-2",
      site_id: SITE_B_ID,
      created_by: "user-super",
      is_active: true,
      expires_at: FUTURE,
    };
    setBearer("aadm_site_bound");
    requestHeaders.set("x-admin-site", "watch-tools");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).toBeNull();
    expect(result.siteSlug).toBe("crypto-tools");
    expect(result.dbSiteId).toBe(SITE_B_ID);
  });

  it("rejects a revoked token", async () => {
    tokenRow = {
      id: "tok-3",
      site_id: null,
      created_by: "user-super",
      is_active: false,
      expires_at: FUTURE,
    };
    setBearer("aadm_revoked");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error?.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    tokenRow = {
      id: "tok-4",
      site_id: null,
      created_by: "user-super",
      is_active: true,
      expires_at: PAST,
    };
    setBearer("aadm_expired");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error?.status).toBe(401);
  });

  it("rejects a token whose admin account was deactivated", async () => {
    adminUser = {
      id: "user-super",
      email: "super@test.com",
      role: "super_admin",
      is_active: false,
    };
    setBearer("aadm_valid");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error?.status).toBe(401);
  });

  it("rejects a non-bearer Authorization scheme without looking up a token", async () => {
    requestHeaders.set("authorization", "Basic YWRtaW46cGFzcw==");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error?.status).toBe(401);
    expect(touchAdminApiToken).not.toHaveBeenCalled();
  });

  it("rate limits per token rather than per admin identity", async () => {
    setBearer("aadm_valid");

    const { checkRateLimit } = await import("@/lib/rate-limit");
    const { requireAdmin } = await import("@/lib/admin-guard");
    await requireAdmin();

    expect(vi.mocked(checkRateLimit).mock.calls.at(-1)?.[0]).toBe("admin-token:tok-1");
  });
});

describe("CSRF exemption for bearer requests", () => {
  const ctx = { pathname: "/api/admin/products", verifiedSite: null } as unknown as Parameters<
    typeof import("@/lib/middleware/csrf").withCsrf
  >[1];

  function post(headers: Record<string, string>, cookie?: string): NextRequest {
    const request = new NextRequest("https://compareai.site/api/admin/products", {
      method: "POST",
      headers: { ...headers, ...(cookie ? { cookie } : {}) },
    });
    return request;
  }

  it("lets a bearer-only request through without a CSRF token", async () => {
    const { withCsrf } = await import("@/lib/middleware/csrf");
    expect(withCsrf(post({ authorization: "Bearer aadm_valid" }), ctx)).toBeNull();
  });

  it("still blocks a cookie-authenticated request that lacks a CSRF token", async () => {
    const { withCsrf } = await import("@/lib/middleware/csrf");
    const response = withCsrf(
      post({ authorization: "Bearer aadm_valid" }, "__Host-nh_admin_token=session-jwt"),
      ctx,
    );

    expect(response?.status).toBe(403);
  });

  it("still blocks a request with no credential at all", async () => {
    const { withCsrf } = await import("@/lib/middleware/csrf");
    expect(withCsrf(post({}), ctx)?.status).toBe(403);
  });
});
