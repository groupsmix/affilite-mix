/**
 * TC-02 — Cross-tenant cookie forgery e2e test.
 *
 * Verifies that a non-super-admin user who forges the `nh_active_site`
 * cookie to a site they do not have membership for receives a 401
 * from requireAdmin().
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks ---

const mockSession = {
  userId: "user-123",
  email: "user@example.com",
  role: "admin" as const,
};

vi.mock("@/lib/auth", () => ({
  getAdminSession: vi.fn().mockResolvedValue(mockSession),
  AdminPayload: {},
}));

// Active site returns the forged slug
vi.mock("@/lib/active-site", () => ({
  getActiveSiteSlug: vi.fn().mockReturnValue("other-site"),
}));

// The site slug IS a valid config entry (exists in multi-tenant config)
vi.mock("@/config/sites", () => ({
  getSiteById: vi.fn().mockReturnValue({ id: "other-site", name: "Other Site" }),
}));

// Site resolution succeeds — the site exists in DB
vi.mock("@/lib/dal/site-resolver", () => ({
  resolveDbSiteId: vi.fn().mockResolvedValue("db-uuid-other-site"),
}));

// But the user has NO membership for this site
vi.mock("@/lib/dal/admin-site-memberships", () => ({
  getAdminSiteMembership: vi.fn().mockResolvedValue(null),
}));

// Rate limit always allows
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 99, retryAfterMs: 0 }),
}));

// Supabase client mock
vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: vi.fn().mockReturnValue({}),
}));

vi.mock("@/lib/dal/sites", () => ({
  getSiteRowBySlugWithClient: vi.fn().mockResolvedValue({ id: "db-uuid-other-site" }),
}));

describe("TC-02: Cross-tenant cookie forgery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when non-super-admin forges nh_active_site to another site", async () => {
    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    // Should be an error response — user lacks membership for "other-site"
    expect(result.error).not.toBeNull();
    expect(result.session).toBeNull();
    expect(result.error!.status).toBe(401);
  });

  it("returns 401 when membership lookup returns null for forged site", async () => {
    const { getAdminSiteMembership } = await import("@/lib/dal/admin-site-memberships");
    const { requireAdmin } = await import("@/lib/admin-guard");

    const result = await requireAdmin();

    expect(result.error).not.toBeNull();
    expect(result.error!.status).toBe(401);
    // Membership was checked
    expect(getAdminSiteMembership).toHaveBeenCalledWith(
      "user-123",
      "db-uuid-other-site",
    );
  });

  it("allows super_admin even without explicit membership", async () => {
    const { getAdminSession } = await import("@/lib/auth");
    vi.mocked(getAdminSession).mockResolvedValueOnce({
      ...mockSession,
      role: "super_admin",
    });

    const { requireAdmin } = await import("@/lib/admin-guard");
    const result = await requireAdmin();

    // super_admin bypasses membership check
    expect(result.error).toBeNull();
    expect(result.session).not.toBeNull();
    expect(result.session!.role).toBe("super_admin");
  });
});
