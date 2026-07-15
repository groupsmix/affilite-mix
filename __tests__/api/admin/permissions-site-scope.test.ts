/**
 * F-5 (defense-in-depth): the admin permissions RBAC route must derive the
 * site from the validated admin session (`dbSiteId`) and reject any
 * client-supplied `site_id` that does not match it — matching the rest of the
 * admin surface (`withAuthz`) rather than trusting query/body input. This keeps
 * the route safe even if the super_admin gate is ever weakened.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const DB_SITE_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_SITE_ID = "22222222-2222-2222-2222-222222222222";
const USER_ID = "33333333-3333-3333-3333-333333333333";

vi.mock("@/lib/admin-guard", async (importOriginal) => {
  // Keep the real assertRole / unauthorizedResponse so the super_admin gate
  // behaves normally; only the requireAdmin gate is driven by the test.
  const actual = await importOriginal<typeof import("@/lib/admin-guard")>();
  return { ...actual, requireAdmin: vi.fn() };
});

vi.mock("@/lib/admin-rate-limit", () => ({
  enforceAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/dal/permissions", () => ({
  listRoles: vi.fn().mockResolvedValue([]),
  listPermissions: vi.fn().mockResolvedValue([]),
  listSiteUserRoles: vi.fn().mockResolvedValue([]),
  assignUserSiteRole: vi.fn().mockResolvedValue({ id: "assignment-1" }),
  removeUserSiteRole: vi.fn().mockResolvedValue(undefined),
  getRoleByName: vi.fn().mockResolvedValue({ id: "role-1", name: "editor" }),
}));

vi.mock("@/lib/audit-log", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/api-error", () => ({
  parseJsonBody: vi.fn().mockImplementation(async (req: Request) => JSON.parse(await req.text())),
}));

import { requireAdmin } from "@/lib/admin-guard";
import { assignUserSiteRole, removeUserSiteRole } from "@/lib/dal/permissions";
import { GET, POST, DELETE } from "@/app/api/admin/permissions/route";

function makeGet(siteId?: string): NextRequest {
  const url = siteId
    ? `http://localhost/api/admin/permissions?site_id=${siteId}`
    : "http://localhost/api/admin/permissions";
  return new NextRequest(url, { method: "GET" });
}

function makePost(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/admin/permissions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete(userId: string, siteId: string): NextRequest {
  return new NextRequest(
    `http://localhost/api/admin/permissions?user_id=${userId}&site_id=${siteId}`,
    { method: "DELETE" },
  );
}

describe("admin/permissions site-scope enforcement (F-5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdmin).mockResolvedValue({
      error: null,
      session: {
        email: "root@test.com",
        userId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        role: "super_admin",
      } as never,
      dbSiteId: DB_SITE_ID,
      siteSlug: "test-site",
    });
  });

  it("GET rejects a site_id that does not match the session's active site", async () => {
    const res = await GET(makeGet(OTHER_SITE_ID));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/site_id/i);
  });

  it("GET allows a site_id matching the server-derived active site", async () => {
    const res = await GET(makeGet(DB_SITE_ID));
    expect(res.status).toBe(200);
  });

  it("GET works with no site_id supplied", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
  });

  it("POST rejects a body site_id that does not match the active site", async () => {
    const res = await POST(
      makePost({ user_id: USER_ID, site_id: OTHER_SITE_ID, role_name: "editor" }),
    );
    expect(res.status).toBe(400);
    expect(vi.mocked(assignUserSiteRole)).not.toHaveBeenCalled();
  });

  it("POST assigns using the server-derived dbSiteId, never the client value", async () => {
    const res = await POST(
      makePost({ user_id: USER_ID, site_id: DB_SITE_ID, role_name: "editor" }),
    );
    expect(res.status).toBe(200);
    expect(vi.mocked(assignUserSiteRole)).toHaveBeenCalledTimes(1);
    const [payload] = vi.mocked(assignUserSiteRole).mock.calls[0]!;
    expect(payload.site_id).toBe(DB_SITE_ID);
    expect(payload.user_id).toBe(USER_ID);
  });

  it("DELETE rejects a site_id that does not match the active site", async () => {
    const res = await DELETE(makeDelete(USER_ID, OTHER_SITE_ID));
    expect(res.status).toBe(400);
    expect(vi.mocked(removeUserSiteRole)).not.toHaveBeenCalled();
  });

  it("DELETE removes using the server-derived dbSiteId when the site_id matches", async () => {
    const res = await DELETE(makeDelete(USER_ID, DB_SITE_ID));
    expect(res.status).toBe(200);
    expect(vi.mocked(removeUserSiteRole)).toHaveBeenCalledWith(
      USER_ID,
      DB_SITE_ID,
      expect.any(Function),
    );
  });
});
