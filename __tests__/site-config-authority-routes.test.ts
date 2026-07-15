import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { allSites } from "@/config/sites";

const mocks = vi.hoisted(() => ({
  getSiteRowById: vi.fn(),
  updateSite: vi.fn(),
  deleteSite: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdminSession: vi.fn().mockResolvedValue({
    error: null,
    session: { role: "super_admin", email: "admin@example.com" },
  }),
  requireAdmin: vi.fn().mockResolvedValue({
    error: null,
    session: { role: "super_admin", email: "admin@example.com" },
  }),
  assertRole: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/admin-rate-limit", () => ({
  enforceAdminRateLimit: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/dal/sites", () => ({
  listSites: vi.fn(),
  createSite: vi.fn(),
  getSiteRowById: mocks.getSiteRowById,
  updateSite: mocks.updateSite,
  deleteSite: mocks.deleteSite,
  upsertConfigSite: vi.fn(),
}));

vi.mock("@/lib/dal/admin-site-memberships", () => ({
  listAdminSiteMemberships: vi.fn(),
}));

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: vi.fn(),
}));

vi.mock("@/lib/audit-log", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/sentry", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/lib/step-up-auth", () => ({
  requireStepUpAuth: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/runtime-env", () => ({
  getAppCacheKV: vi.fn().mockReturnValue(null),
}));

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
}));

import { PATCH } from "@/app/api/admin/sites/route";
import { PUT } from "@/app/api/admin/sites/[id]/route";

const staticRow = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: allSites[0]!.id,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSiteRowById.mockResolvedValue(staticRow);
});

describe("static tenant admin mutation guards", () => {
  it("rejects status changes through the collection route", async () => {
    const request = new NextRequest("https://example.test/api/admin/sites", {
      method: "PATCH",
      body: JSON.stringify({ id: staticRow.id, is_active: false }),
      headers: { "content-type": "application/json" },
    });

    const response = await PATCH(request);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Static-config sites are read-only in the admin API",
    });
    expect(mocks.updateSite).not.toHaveBeenCalled();
  });

  it("rejects edits through the item route", async () => {
    const request = new NextRequest(`https://example.test/api/admin/sites/${staticRow.id}`, {
      method: "PUT",
      body: JSON.stringify({ name: "Database override" }),
      headers: { "content-type": "application/json" },
    });

    const response = await PUT(request, {
      params: Promise.resolve({ id: staticRow.id }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Static-config sites are read-only in the admin API",
    });
    expect(mocks.updateSite).not.toHaveBeenCalled();
  });
});
