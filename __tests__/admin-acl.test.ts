/**
 * Admin ACL (Access Control List) tests.
 *
 * Verifies tenant isolation for admin operations:
 *   1. A tenant-A admin cannot access tenant-B data via requireAdmin()
 *   2. A super_admin can access any tenant
 *   3. An invalid/forged site cookie is rejected
 *   4. Site selection endpoint enforces membership
 *
 * These tests mock the DAL and auth layers to test the guard logic
 * in isolation, without requiring a live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────

// Mock next/headers cookies
const mockCookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = mockCookieStore.get(name);
      return value !== undefined ? { value } : undefined;
    },
  }),
}));

// Mock auth — control session per test
let mockSession: {
  email?: string;
  userId?: string;
  role: "admin" | "super_admin";
} | null = null;

vi.mock("@/lib/auth", () => ({
  getAdminSession: async () => mockSession,
  AdminPayload: {},
}));

// Mock rate limiter — always allow
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: async () => ({ allowed: true, remaining: 99, retryAfterMs: 0 }),
}));

// Mock site resolver — map slug to a deterministic UUID
const SITE_A_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SITE_B_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const slugToId: Record<string, string> = {
  "watch-tools": SITE_A_ID,
  "crypto-tools": SITE_B_ID,
};

vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: async (slug: string) => {
    const id = slugToId[slug];
    if (!id) throw new Error(`Site not found in database for slug: ${slug}`);
    return id;
  },
}));

// Mock membership DAL — control per test
let membershipRows: Record<string, Set<string>> = {};

vi.mock("@/lib/dal/admin-site-memberships", () => ({
  getAdminSiteMembership: async (adminUserId: string, siteId: string) => {
    const sites = membershipRows[adminUserId];
    if (sites?.has(siteId)) {
      return { id: "mem-1", admin_user_id: adminUserId, site_id: siteId, created_at: "" };
    }
    return null;
  },
}));

// ── Tests ────────────────────────────────────────────────────────

describe("Admin ACL — requireAdmin()", () => {
  beforeEach(() => {
    mockCookieStore.clear();
    mockSession = null;
    membershipRows = {};
  });

  it("rejects unauthenticated requests (no session)", async () => {
    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).not.toBeNull();
    const body = await result.error!.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("rejects when no site cookie is set", async () => {
    mockSession = { email: "admin@a.com", userId: "user-a", role: "admin" };

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).not.toBeNull();
    const body = await result.error!.json();
    expect(body.error).toBe("No site selected");
  });

  it("rejects invalid/forged site cookie value", async () => {
    mockSession = { email: "admin@a.com", userId: "user-a", role: "admin" };
    mockCookieStore.set("nh_active_site", "nonexistent-site-slug");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).not.toBeNull();
    const body = await result.error!.json();
    expect(body.error).toBe("Invalid site");
  });

  it("tenant-A admin CANNOT access tenant-B", async () => {
    mockSession = { email: "admin@a.com", userId: "user-a", role: "admin" };
    // user-a has membership for site A only
    membershipRows["user-a"] = new Set([SITE_A_ID]);
    // but the cookie points to site B
    mockCookieStore.set("nh_active_site", "crypto-tools");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).not.toBeNull();
    const body = await result.error!.json();
    expect(result.error!.status).toBe(403);
    expect(body.error).toBe("You do not have access to this site");
  });

  it("tenant-A admin CAN access tenant-A", async () => {
    mockSession = { email: "admin@a.com", userId: "user-a", role: "admin" };
    membershipRows["user-a"] = new Set([SITE_A_ID]);
    mockCookieStore.set("nh_active_site", "watch-tools");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).toBeNull();
    expect(result.session).not.toBeNull();
    expect(result.dbSiteId).toBe(SITE_A_ID);
    expect(result.siteSlug).toBe("watch-tools");
  });

  it("super_admin CAN access any tenant", async () => {
    mockSession = { email: "super@test.com", userId: "user-super", role: "super_admin" };
    // super_admin has NO membership rows — still allowed via role bypass
    mockCookieStore.set("nh_active_site", "crypto-tools");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).toBeNull();
    expect(result.session).not.toBeNull();
    expect(result.dbSiteId).toBe(SITE_B_ID);
    expect(result.siteSlug).toBe("crypto-tools");
  });

  it("super_admin CAN switch to any site even without membership", async () => {
    mockSession = { email: "super@test.com", userId: "user-super", role: "super_admin" };
    membershipRows = {}; // no memberships at all
    mockCookieStore.set("nh_active_site", "watch-tools");

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    expect(result.error).toBeNull();
    expect(result.siteSlug).toBe("watch-tools");
  });
});

describe("Admin ACL — requireSuperAdmin()", () => {
  beforeEach(() => {
    mockCookieStore.clear();
    mockSession = null;
    membershipRows = {};
  });

  it("rejects non-super_admin users", async () => {
    mockSession = { email: "admin@a.com", userId: "user-a", role: "admin" };
    membershipRows["user-a"] = new Set([SITE_A_ID]);
    mockCookieStore.set("nh_active_site", "watch-tools");

    const { requireSuperAdmin } = await import("@/lib/admin-guard");
    const result = await requireSuperAdmin();

    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(403);
  });

  it("allows super_admin users", async () => {
    mockSession = { email: "super@test.com", userId: "user-super", role: "super_admin" };
    mockCookieStore.set("nh_active_site", "watch-tools");

    const { requireSuperAdmin } = await import("@/lib/admin-guard");
    const result = await requireSuperAdmin();

    expect(result.error).toBeNull();
    expect(result.session?.role).toBe("super_admin");
  });
});

describe("Admin ACL — assertRole()", () => {
  it("returns null (OK) when role meets requirement", async () => {
    const { assertRole } = await import("@/lib/admin-guard");
    const result = assertRole(
      { email: "a@b.com", userId: "u1", role: "super_admin" },
      "super_admin",
    );
    expect(result).toBeNull();
  });

  it("returns 403 when admin tries to assert super_admin", async () => {
    const { assertRole } = await import("@/lib/admin-guard");
    const result = assertRole({ email: "a@b.com", userId: "u1", role: "admin" }, "super_admin");
    expect(result).not.toBeNull();
    expect(result!.status).toBe(403);
  });

  it("allows admin role when admin is required", async () => {
    const { assertRole } = await import("@/lib/admin-guard");
    const result = assertRole({ email: "a@b.com", userId: "u1", role: "admin" }, "admin");
    expect(result).toBeNull();
  });
});
