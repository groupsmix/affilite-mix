import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mocks ────────────────────────────────────────────────────────

vi.mock("@/lib/auth", () => ({
  getAdminSession: vi.fn(),
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

// ── Helpers ──────────────────────────────────────────────────────

type AdminRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: "admin" | "super_admin";
  is_active: boolean;
  totp_secret: string | null;
  totp_enabled: boolean;
  totp_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

function makeRow(partial: Partial<AdminRow>): AdminRow {
  return {
    id: "id",
    email: "a@test.com",
    password_hash: "",
    name: "",
    role: "admin",
    is_active: true,
    totp_secret: null,
    totp_enabled: false,
    totp_verified_at: null,
    created_at: "2024-01-01",
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
    const { getAdminSession } = await import("@/lib/auth");
    vi.mocked(getAdminSession).mockResolvedValue({
      email: "root@test.com",
      userId: "root-id",
      role: "super_admin",
    });
  });

  // ── PATCH ──────────────────────────────────────────────────────

  it("PATCH blocks demoting the last active super_admin", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, updateAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "u1", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(false);

    const { PATCH } = await import("@/app/api/admin/users/route");
    const res = await PATCH(patchRequest({ id: "u1", role: "admin" }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/last active super_admin/i);
    expect(vi.mocked(updateAdminUser)).not.toHaveBeenCalled();
  });

  it("PATCH blocks deactivating the last active super_admin", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, updateAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "u1", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(false);

    const { PATCH } = await import("@/app/api/admin/users/route");
    const res = await PATCH(patchRequest({ id: "u1", is_active: false }));

    expect(res.status).toBe(409);
    expect(vi.mocked(updateAdminUser)).not.toHaveBeenCalled();
  });

  it("PATCH allows demotion when another active super_admin exists", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, updateAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "u1", role: "super_admin", is_active: true }),
      makeRow({ id: "u2", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(true);
    vi.mocked(updateAdminUser).mockResolvedValue(
      makeRow({ id: "u1", role: "admin", is_active: true }),
    );

    const { PATCH } = await import("@/app/api/admin/users/route");
    const res = await PATCH(patchRequest({ id: "u1", role: "admin" }));

    expect(res.status).toBe(200);
    expect(vi.mocked(updateAdminUser)).toHaveBeenCalledTimes(1);
  });

  it("PATCH does not run the guard when target is a regular admin", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, updateAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "u1", role: "admin", is_active: true }),
    ]);
    vi.mocked(updateAdminUser).mockResolvedValue(
      makeRow({ id: "u1", role: "admin", is_active: false }),
    );

    const { PATCH } = await import("@/app/api/admin/users/route");
    const res = await PATCH(patchRequest({ id: "u1", is_active: false }));

    expect(res.status).toBe(200);
    expect(vi.mocked(hasAnotherActiveSuperAdmin)).not.toHaveBeenCalled();
  });

  // ── DELETE ─────────────────────────────────────────────────────

  it("DELETE blocks deleting the last active super_admin", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, deleteAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "u1", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(false);

    const { DELETE } = await import("@/app/api/admin/users/route");
    const res = await DELETE(deleteRequest("u1"));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/last active super_admin/i);
    expect(vi.mocked(deleteAdminUser)).not.toHaveBeenCalled();
  });

  it("DELETE allows deleting a super_admin when another active super_admin exists", async () => {
    const { listAdminUsers, hasAnotherActiveSuperAdmin, deleteAdminUser } =
      await import("@/lib/dal/admin-users");
    vi.mocked(listAdminUsers).mockResolvedValue([
      makeRow({ id: "u1", role: "super_admin", is_active: true }),
      makeRow({ id: "u2", role: "super_admin", is_active: true }),
    ]);
    vi.mocked(hasAnotherActiveSuperAdmin).mockResolvedValue(true);

    const { DELETE } = await import("@/app/api/admin/users/route");
    const res = await DELETE(deleteRequest("u1"));

    expect(res.status).toBe(200);
    expect(vi.mocked(deleteAdminUser)).toHaveBeenCalledWith("u1");
  });
});
