/**
 * Tests for site-scoped API tokens:
 *  - POST /api/admin/api-tokens honours `scope: "site" | "all"` and derives the
 *    site id from the authenticated context (never request input).
 *  - A session minted from a site-scoped token cannot switch sites via
 *    /api/admin/sites/select.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireAdminSession: vi.fn(),
  assertRole: vi.fn(),
  unauthorizedResponse: vi.fn(),
  createAdminApiToken: vi.fn(),
  listAdminApiTokens: vi.fn(),
  recordAuditEvent: vi.fn(),
  enforceAdminRateLimit: vi.fn(),
  generateSecretToken: vi.fn(),
  hashSecretToken: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  requireAdminSession: mocks.requireAdminSession,
  assertRole: mocks.assertRole,
  unauthorizedResponse: mocks.unauthorizedResponse,
}));
vi.mock("@/lib/dal/admin-api-tokens", () => ({
  createAdminApiToken: mocks.createAdminApiToken,
  listAdminApiTokens: mocks.listAdminApiTokens,
}));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/admin-rate-limit", () => ({ enforceAdminRateLimit: mocks.enforceAdminRateLimit }));
vi.mock("@/lib/generate-token", () => ({
  generateSecretToken: mocks.generateSecretToken,
  hashSecretToken: mocks.hashSecretToken,
}));

import { POST as createTokenRoute } from "@/app/api/admin/api-tokens/route";
import { POST as selectSiteRoute } from "@/app/api/admin/sites/select/route";

function jsonReq(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({
    error: null,
    session: { role: "super_admin", email: "a@e.com", userId: "u1" },
    dbSiteId: "site-db-uuid-1",
    siteSlug: "wristnerd",
  });
  mocks.assertRole.mockReturnValue(null);
  mocks.generateSecretToken.mockReturnValue("aadm_plain");
  mocks.hashSecretToken.mockResolvedValue("hash");
  mocks.createAdminApiToken.mockImplementation(async (v: { site_id: string | null }) => ({
    id: "tok1",
    site_id: v.site_id,
    name: "n",
    created_by: "u1",
    expires_at: new Date(Date.now() + 1000).toISOString(),
    created_at: new Date().toISOString(),
    is_active: true,
  }));
  mocks.enforceAdminRateLimit.mockResolvedValue(null);
});

describe("POST /api/admin/api-tokens scope", () => {
  it('scope "site" binds the token to the active site from context', async () => {
    const res = await createTokenRoute(
      jsonReq("https://x.test/api/admin/api-tokens", { name: "AI", scope: "site" }),
    );
    expect(res.status).toBe(200);
    expect(mocks.createAdminApiToken).toHaveBeenCalledWith(
      expect.objectContaining({ site_id: "site-db-uuid-1" }),
    );
  });

  it('scope "all" creates a global (null site_id) token', async () => {
    await createTokenRoute(
      jsonReq("https://x.test/api/admin/api-tokens", { name: "AI", scope: "all" }),
    );
    expect(mocks.createAdminApiToken).toHaveBeenCalledWith(
      expect.objectContaining({ site_id: null }),
    );
  });

  it("defaults to all-sites when no scope is given (back-compat)", async () => {
    await createTokenRoute(jsonReq("https://x.test/api/admin/api-tokens", { name: "AI" }));
    expect(mocks.createAdminApiToken).toHaveBeenCalledWith(
      expect.objectContaining({ site_id: null }),
    );
  });

  it("ignores request-supplied site_id when scope is provided", async () => {
    await createTokenRoute(
      jsonReq("https://x.test/api/admin/api-tokens", {
        name: "AI",
        scope: "site",
        site_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      }),
    );
    // scope wins — the site comes from the authenticated context, not the body.
    expect(mocks.createAdminApiToken).toHaveBeenCalledWith(
      expect.objectContaining({ site_id: "site-db-uuid-1" }),
    );
  });
});

describe("POST /api/admin/sites/select with a scoped session", () => {
  it("blocks a site-scoped session from switching sites", async () => {
    mocks.requireAdminSession.mockResolvedValue({
      error: null,
      session: { role: "super_admin", userId: "u1", site_id: "site-db-uuid-1" },
    });
    const res = await selectSiteRoute(
      jsonReq("https://x.test/api/admin/sites/select", { siteId: "other-site" }),
    );
    expect(res.status).toBe(403);
  });

  it("allows an unscoped session to switch sites", async () => {
    mocks.requireAdminSession.mockResolvedValue({
      error: null,
      session: { role: "super_admin", userId: "u1" },
    });
    const res = await selectSiteRoute(
      jsonReq("https://x.test/api/admin/sites/select", { siteId: "" }),
    );
    // Not a 403 scope block — it proceeds to normal validation (400 for empty id).
    expect(res.status).not.toBe(403);
  });
});
