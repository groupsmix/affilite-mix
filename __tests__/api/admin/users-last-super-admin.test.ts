import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/admin-guard", async (importOriginal) => {
  // Keep the real assertRole/unauthorizedResponse helpers (G-45) so the
  // route returns the standardised 401 + Bearer when the role is wrong;
  // mock only the requireAdmin gate so these tests can drive sessions.
  const actual = await importOriginal<typeof import("@/lib/admin-guard")>();
  return {
    ...actual,
    requireAdmin: vi.fn(),
  };
});

// FIX-18 step-up auth is enforced on PATCH/DELETE; bypass it for these tests
// so we can exercise the last-super_admin guard in isolation. Step-up
// behavior itself is covered by lib/__tests__ for step-up-auth.
vi.mock("@/lib/step-up-auth", () => ({
  requireStepUpAuth: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 10, retryAfterMs: 0 }),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/dal/admin-users", () => ({
  listAdminUsers: vi.fn(),
  createAdminUser: vi.fn(),
  updateAdminUser: vi.fn(),
  deleteAdminUser: vi.fn(),
  hasAnotherActiveSuperAdmin: vi.fn(),
}));

vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn().mockResolvedValue("hashed"),
}));

vi.mock("@/lib/password-policy", () => ({
  validatePasswordPolicy: vi.fn().mockReturnValue({ valid: true }),
  checkBreachedPassword: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/api-error", () => ({
  parseJsonBody: vi.fn().mockImplementation(async (req: Request) => {
    const text = await req.text();
    return JSON.parse(text);
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────

interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: "admin" | "super_admin";
  is_active: boolean;
  password_hash: string;
  totp_secret: string | null;
  totp_enabled: boolean;
  totp_verified_at: string | null;
  // F4 audit: highest TOTP time-step consumed. NULL = no baseline yet.
  totp_last_step: number | null;
  totp_failed_attempts: number;
  totp_locked_until: string | null;
  login_failed_attempts: number;
  login_locked_until: string | null;
  reset_token: string | null;
  reset_token_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function makeRow(partial: Partial<AdminRow>): AdminRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    email: "a@test.com",
    password_hash: "",
    name: "",
    role: "admin",
    is_active: true,
    totp_secret: null,
    totp_enabled: false,
    totp_verified_at: null,
    totp_last_step: null,
    totp_failed_attempts: 0,
    totp_locked_until: null,
    login_failed_attempts: 0,
    login_locked_until: null,
    reset_token: null,
    reset_token_expires_at: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01",
    ...partial,
  };
}

function patchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/admin/users?id=${id}`, {
    method: "DELETE",
  });
}

// ── Tests ────────────────────────────────────────────────────────

describe("admin/users last-super_admin safety guard", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { requireAdmin } = await import("@/lib/admin-guard");
    vi.mocked(requireAdmin).mockResolvedValue({
      error: null,
      session: {
        email: "root@test.com",
        userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        role: "super_admin",
      },
      dbSiteId: "site-uuid",
      siteSlug: "test-site",
      caller: { type: "interactive" },
    });
  });

  // ── PATCH ──────────────────────────────────────────────────────

  it("PATCH blocks demoting the last active super_admin", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, updateAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "22222222-2222-2222-2222-222222222222", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(false);

    const { PATCH } = await import("@/app/api/admin/users/route");
    const res = await PATCH(
      patchRequest({ id: "22222222-2222-2222-2222-222222222222", role: "admin" }),
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/last active super_admin/i);
    expect(vi.mocked(updateAdminUser)).not.toHaveBeenCalled();
  });

  it("PATCH blocks deactivating the last active super_admin", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, updateAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "22222222-2222-2222-2222-222222222222", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(false);

    const { PATCH } = await import("@/app/api/admin/users/route");
    const res = await PATCH(
      patchRequest({ id: "22222222-2222-2222-2222-222222222222", is_active: false }),
    );

    expect(res.status).toBe(409);
    expect(vi.mocked(updateAdminUser)).not.toHaveBeenCalled();
  });

  it("PATCH allows demotion when another active super_admin exists", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, updateAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "22222222-2222-2222-2222-222222222222", role: "super_admin", is_active: true }),
      makeRow({ id: "33333333-3333-3333-3333-333333333333", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(true);
    vi.mocked(updateAdminUser).mockResolvedValue(
      makeRow({ id: "22222222-2222-2222-2222-222222222222", role: "admin", is_active: true }),
    );

    const { PATCH } = await import("@/app/api/admin/users/route");
    const res = await PATCH(
      patchRequest({ id: "22222222-2222-2222-2222-222222222222", role: "admin" }),
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(updateAdminUser)).toHaveBeenCalledTimes(1);
  });

  it("PATCH does not run the guard when target is a regular admin", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, updateAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "22222222-2222-2222-2222-222222222222", role: "admin", is_active: true }),
    ]);
    vi.mocked(updateAdminUser).mockResolvedValue(
      makeRow({ id: "22222222-2222-2222-2222-222222222222", role: "admin", is_active: false }),
    );

    const { PATCH } = await import("@/app/api/admin/users/route");
    const res = await PATCH(
      patchRequest({ id: "22222222-2222-2222-2222-222222222222", is_active: false }),
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(hasAnotherActiveSuperAdmin)).not.toHaveBeenCalled();
  });

  // ── DELETE ─────────────────────────────────────────────────────

  it("DELETE blocks deleting the last active super_admin", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, deleteAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "22222222-2222-2222-2222-222222222222", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(false);

    const { DELETE } = await import("@/app/api/admin/users/route");
    const res = await DELETE(deleteRequest("22222222-2222-2222-2222-222222222222"));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/last active super_admin/i);
    expect(vi.mocked(deleteAdminUser)).not.toHaveBeenCalled();
  });

  it("DELETE allows deleting a super_admin when another active super_admin exists", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, deleteAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "22222222-2222-2222-2222-222222222222", role: "super_admin", is_active: true }),
      makeRow({ id: "33333333-3333-3333-3333-333333333333", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(true);

    const { DELETE } = await import("@/app/api/admin/users/route");
    const res = await DELETE(deleteRequest("22222222-2222-2222-2222-222222222222"));

    expect(res.status).toBe(200);
    expect(vi.mocked(deleteAdminUser)).toHaveBeenCalledWith("22222222-2222-2222-2222-222222222222");
  });
});
