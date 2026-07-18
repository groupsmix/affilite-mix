/**
 * Cross-tenant authorization tests.
 *
 * For every admin/data-mutation primitive that can be reached with a
 * caller-controlled resource id we check the security-relevant
 * scenarios:
 *
 *   1. admin of site A cannot read   site B content
 *   2. admin of site A cannot update site B product
 *   3. admin of site A cannot delete site B asset
 *   4. super_admin can access cross-site paths
 *   5. resource id and site id mismatch is rejected
 *   6. missing site context is rejected
 *
 * The tests mock the privileged Supabase gateway and the permission DAL
 * so we exercise the guard logic in `lib/authz.ts` and a representative
 * `[id]` route handler without a live database.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AdminPayload } from "@/lib/auth";

// ── Mocks ────────────────────────────────────────────────────────

// Recording Supabase client. Each table maps a row id to the row's
// `site_id`, so the test can pick any (resource, expectedSite) pair to
// simulate cross-tenant attempts.
const SITE_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const SITE_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type Row = { id: string; site_id: string };
const tableRows: Record<string, Row[]> = {
  pages: [
    { id: "page-on-A", site_id: SITE_A },
    { id: "page-on-B", site_id: SITE_B },
  ],
  products: [
    { id: "product-on-A", site_id: SITE_A },
    { id: "product-on-B", site_id: SITE_B },
  ],
  ad_placements: [
    { id: "ad-on-A", site_id: SITE_A },
    { id: "ad-on-B", site_id: SITE_B },
  ],
  content: [
    { id: "content-on-A", site_id: SITE_A },
    { id: "content-on-B", site_id: SITE_B },
  ],
  quizzes: [
    { id: "quiz-on-A", site_id: SITE_A },
    { id: "quiz-on-B", site_id: SITE_B },
  ],
  drip_campaigns: [
    { id: "drip-on-A", site_id: SITE_A },
    { id: "drip-on-B", site_id: SITE_B },
  ],
  commissions: [
    { id: "comm-on-A", site_id: SITE_A },
    { id: "comm-on-B", site_id: SITE_B },
  ],
  memberships: [
    { id: "member-on-A", site_id: SITE_A },
    { id: "member-on-B", site_id: SITE_B },
  ],
};

/** Set this to a truthy value to make the next maybeSingle() return an error. */
let forceDbError: { message: string; code: string } | null = null;

function fakeFrom(table: string) {
  const rows = tableRows[table] ?? [];
  return {
    select() {
      return this;
    },
    eq(_col: string, value: string) {
      this._id = value;
      return this;
    },
    unsafeNoSiteFilter() {
      return this;
    },
    abortSignal(_signal: AbortSignal) {
      return this;
    },
    async maybeSingle() {
      if (forceDbError) {
        const err = forceDbError;
        forceDbError = null;
        return { data: null, error: err };
      }
      const id = (this as { _id?: string })._id;
      const row = rows.find((r) => r.id === id);
      return { data: row ?? null, error: null };
    },
    _id: undefined as string | undefined,
  };
}

vi.mock("@/lib/server-only/service-role", () => ({
  getPrivilegedSupabaseClient: () => ({
    from: (table: string) => fakeFrom(table),
  }),
}));

// Mock requireAdmin for withAuthz / withAuthzDynamic tests
let requireAdminResult: {
  error?: unknown;
  session: AdminPayload | null;
  dbSiteId: string | null;
  siteSlug: string | null;
} = { session: null, dbSiteId: null, siteSlug: null };

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: async () => requireAdminResult,
}));

// hasPermission: super_admin / owner bypass mirrored from real impl,
// otherwise grant only when the user has a membership for the queried
// site_id (set up per test).
const memberships: Record<string, Set<string>> = {};
const globalRoles: Record<string, "super_admin" | "owner" | "admin" | undefined> = {};

vi.mock("@/lib/dal/permissions", () => ({
  hasPermission: async (userId: string, siteId: string) => {
    const role = globalRoles[userId];
    if (role === "super_admin" || role === "owner") return true;
    return memberships[userId]?.has(siteId) ?? false;
  },
}));

// The auth module is touched by authz.ts; provide a getAdminSession
// stub even though most tests pass session in directly.
let currentSession: AdminPayload | null = null;
vi.mock("@/lib/auth", () => ({
  getAdminSession: async () => currentSession,
  AdminPayload: {},
}));

// ── Helpers ──────────────────────────────────────────────────────

function makeSession(userId: string, role: "admin" | "super_admin" = "admin"): AdminPayload {
  return {
    userId,
    email: `${userId}@test.com`,
    role,
  } as AdminPayload;
}

// ── Tests: authorizeResource ─────────────────────────────────────

describe("authorizeResource — cross-tenant negative paths", () => {
  beforeEach(() => {
    for (const k of Object.keys(memberships)) delete memberships[k];
    for (const k of Object.keys(globalRoles)) delete globalRoles[k];
    currentSession = null;
    forceDbError = null;
  });

  it("rejects an unauthenticated caller (missing site context)", async () => {
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: null,
      feature: "content",
      action: "view",
      resourceType: "page",
      resourceId: "page-on-A",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(401);
    }
  });

  it("rejects when the resource does not exist (and does not leak the table)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "content",
      action: "view",
      resourceType: "page",
      resourceId: "does-not-exist",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("admin of site A cannot read site B content (resource fetched, real site_id wins)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "content",
      action: "view",
      resourceType: "content",
      resourceId: "content-on-B",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("admin of site A cannot update site B product", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "products",
      action: "edit",
      resourceType: "product",
      resourceId: "product-on-B",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("admin of site A cannot delete site B asset", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "settings",
      action: "delete",
      resourceType: "ad_placement",
      resourceId: "ad-on-B",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("admin of site A CAN update site A asset", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "settings",
      action: "edit",
      resourceType: "ad_placement",
      resourceId: "ad-on-A",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.siteId).toBe(SITE_A);
  });

  it("super_admin can access cross-site resources (allowed cross-site path)", async () => {
    globalRoles["super-user"] = "super_admin";
    const { authorizeResource } = await import("@/lib/authz");

    const onA = await authorizeResource({
      session: makeSession("super-user", "super_admin"),
      feature: "content",
      action: "edit",
      resourceType: "page",
      resourceId: "page-on-A",
    });
    const onB = await authorizeResource({
      session: makeSession("super-user", "super_admin"),
      feature: "content",
      action: "edit",
      resourceType: "page",
      resourceId: "page-on-B",
    });

    expect(onA.ok).toBe(true);
    expect(onB.ok).toBe(true);
  });

  it("rejects when resourceId and expectedSiteId disagree (forged ?site_id=)", async () => {
    // Caller has membership for SITE_A and submits resource owned by
    // SITE_B but claims expectedSiteId = SITE_A — must be a 403.
    memberships["user-a"] = new Set([SITE_A, SITE_B]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "content",
      action: "edit",
      resourceType: "page",
      resourceId: "page-on-B",
      expectedSiteId: SITE_A,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.reason).toMatch(/active site|does not belong/i);
    }
  });

  it("accepts when resourceId and expectedSiteId agree", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "content",
      action: "edit",
      resourceType: "page",
      resourceId: "page-on-A",
      expectedSiteId: SITE_A,
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.siteId).toBe(SITE_A);
  });

  it("rejects an unknown resource type instead of querying an arbitrary table", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "content",
      action: "view",
      // Cast to bypass the type guard — this simulates a future caller
      // that forgot to add a registry entry for a new resource type.
      resourceType: "evil_table" as unknown as "page",
      resourceId: "anything",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect([403, 404]).toContain(result.status);
    }
  });

  it("admin of site A cannot access site B quiz (S11-005 catalog expansion)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "content",
      action: "edit",
      resourceType: "quiz",
      resourceId: "quiz-on-B",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("admin of site A CAN access site A quiz (S11-005)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "content",
      action: "edit",
      resourceType: "quiz",
      resourceId: "quiz-on-A",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.siteId).toBe(SITE_A);
  });

  it("admin of site A cannot access site B drip_campaign (S11-005)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "content",
      action: "edit",
      resourceType: "drip_campaign",
      resourceId: "drip-on-B",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("admin of site A CAN access site A drip_campaign (S11-005)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "content",
      action: "edit",
      resourceType: "drip_campaign",
      resourceId: "drip-on-A",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.siteId).toBe(SITE_A);
  });

  it("admin of site A cannot access site B commission (S11-005)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "products",
      action: "view",
      resourceType: "commission",
      resourceId: "comm-on-B",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("admin of site A CAN access site A commission (S11-005)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "products",
      action: "view",
      resourceType: "commission",
      resourceId: "comm-on-A",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.siteId).toBe(SITE_A);
  });

  it("admin of site A cannot access site B membership (S11-005)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "settings",
      action: "view",
      resourceType: "membership",
      resourceId: "member-on-B",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("admin of site A CAN access site A membership (S11-005)", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "settings",
      action: "view",
      resourceType: "membership",
      resourceId: "member-on-A",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.siteId).toBe(SITE_A);
  });
});

// ── Tests: authorizeResource — circuit breaker & validation branches ──

describe("authorizeResource — circuit breaker and input validation branches", () => {
  beforeEach(() => {
    for (const k of Object.keys(memberships)) delete memberships[k];
    for (const k of Object.keys(globalRoles)) delete globalRoles[k];
    currentSession = null;
  });

  it("returns 404 when the DB lookup returns an error (circuit breaker catch path)", async () => {
    memberships["user-a"] = new Set([SITE_A]);

    // Force Supabase to return an error so the circuit breaker's catch fires
    forceDbError = { message: "connection refused", code: "PGRST000" };

    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "products",
      action: "edit",
      resourceType: "product",
      resourceId: "product-on-A",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("returns 404 when resourceId is an empty string", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "products",
      action: "edit",
      resourceType: "product",
      resourceId: "",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("returns 404 when resourceId is not a string", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResource } = await import("@/lib/authz");

    const result = await authorizeResource({
      session: makeSession("user-a"),
      feature: "products",
      action: "edit",
      resourceType: "product",
      resourceId: 12345 as unknown as string,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

// ── Tests: authz error response shape ────────────────────────────

describe("authorizationErrorResponse", () => {
  it("produces a NextResponse with the failure status and message", async () => {
    const { authorizationErrorResponse } = await import("@/lib/authz");

    const res = authorizationErrorResponse({
      ok: false,
      status: 403,
      reason: "Forbidden: resource does not belong to the active site",
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/active site/i);
  });
});

// ── Tests: withAuthz ─────────────────────────────────────────────

describe("withAuthz — route handler guard", () => {
  beforeEach(() => {
    for (const k of Object.keys(memberships)) delete memberships[k];
    for (const k of Object.keys(globalRoles)) delete globalRoles[k];
    currentSession = null;
    forceDbError = null;
  });

  it("returns auth error when requireAdmin fails", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    requireAdminResult = { error: errorResponse, session: null, dbSiteId: null, siteSlug: null };
    const { withAuthz } = await import("@/lib/authz");

    const handler = vi.fn();
    const wrappedHandler = withAuthz("content", "view", handler);
    const result = await wrappedHandler(new Request("http://localhost/api/test") as never);

    expect(result).toBe(errorResponse);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 401 when session has no userId", async () => {
    requireAdminResult = {
      session: { userId: "", email: "x@test.com", role: "admin" } as AdminPayload,
      dbSiteId: SITE_A,
      siteSlug: "site-a",
    };
    const { withAuthz } = await import("@/lib/authz");

    const handler = vi.fn();
    const wrappedHandler = withAuthz("content", "view", handler);
    const result = await wrappedHandler(new Request("http://localhost/api/test") as never);

    expect(result.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks permission", async () => {
    requireAdminResult = {
      session: makeSession("user-a"),
      dbSiteId: SITE_A,
      siteSlug: "site-a",
    };
    // No membership for user-a on SITE_A
    const { withAuthz } = await import("@/lib/authz");

    const handler = vi.fn();
    const wrappedHandler = withAuthz("content", "view", handler);
    const result = await wrappedHandler(new Request("http://localhost/api/test") as never);

    expect(result.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls handler when authorized", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    requireAdminResult = {
      session: makeSession("user-a"),
      dbSiteId: SITE_A,
      siteSlug: "site-a",
    };
    const { withAuthz } = await import("@/lib/authz");

    const mockResponse = new Response("ok", { status: 200 });
    const handler = vi.fn().mockResolvedValue(mockResponse);
    const wrappedHandler = withAuthz("content", "view", handler);
    const result = await wrappedHandler(new Request("http://localhost/api/test") as never);

    expect(handler).toHaveBeenCalled();
    expect(result).toBe(mockResponse);
  });
});

// ── Tests: withAuthzDynamic ──────────────────────────────────────

describe("withAuthzDynamic — dynamic route handler guard", () => {
  beforeEach(() => {
    for (const k of Object.keys(memberships)) delete memberships[k];
    for (const k of Object.keys(globalRoles)) delete globalRoles[k];
    currentSession = null;
    forceDbError = null;
  });

  it("returns auth error when requireAdmin fails", async () => {
    const errorResponse = new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    requireAdminResult = { error: errorResponse, session: null, dbSiteId: null, siteSlug: null };
    const { withAuthzDynamic } = await import("@/lib/authz");

    const handler = vi.fn();
    const wrappedHandler = withAuthzDynamic("content", "view", handler);
    const result = await wrappedHandler(new Request("http://localhost/api/test") as never, {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(result).toBe(errorResponse);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 401 when session has no userId", async () => {
    requireAdminResult = {
      session: { userId: "", email: "x@test.com", role: "admin" } as AdminPayload,
      dbSiteId: SITE_A,
      siteSlug: "site-a",
    };
    const { withAuthzDynamic } = await import("@/lib/authz");

    const handler = vi.fn();
    const wrappedHandler = withAuthzDynamic("content", "view", handler);
    const result = await wrappedHandler(new Request("http://localhost/api/test") as never, {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(result.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns 403 when user lacks permission", async () => {
    requireAdminResult = {
      session: makeSession("user-a"),
      dbSiteId: SITE_A,
      siteSlug: "site-a",
    };
    const { withAuthzDynamic } = await import("@/lib/authz");

    const handler = vi.fn();
    const wrappedHandler = withAuthzDynamic("content", "view", handler);
    const result = await wrappedHandler(new Request("http://localhost/api/test") as never, {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(result.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls handler with resolved params when authorized", async () => {
    memberships["user-a"] = new Set([SITE_A]);
    requireAdminResult = {
      session: makeSession("user-a"),
      dbSiteId: SITE_A,
      siteSlug: "site-a",
    };
    const { withAuthzDynamic } = await import("@/lib/authz");

    const mockResponse = new Response("ok", { status: 200 });
    const handler = vi.fn().mockResolvedValue(mockResponse);
    const wrappedHandler = withAuthzDynamic("content", "view", handler);
    const result = await wrappedHandler(new Request("http://localhost/api/test") as never, {
      params: Promise.resolve({ id: "abc" }),
    });

    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0]![1].params).toEqual({ id: "abc" });
    expect(result).toBe(mockResponse);
  });
});

// ── Tests: authorizeResourceForCurrentSession ────────────────────

describe("authorizeResourceForCurrentSession", () => {
  beforeEach(() => {
    for (const k of Object.keys(memberships)) delete memberships[k];
    for (const k of Object.keys(globalRoles)) delete globalRoles[k];
    currentSession = null;
    forceDbError = null;
  });

  it("returns failure when no session is active", async () => {
    currentSession = null;
    const { authorizeResourceForCurrentSession } = await import("@/lib/authz");

    const result = await authorizeResourceForCurrentSession({
      feature: "content",
      action: "view",
      resourceType: "page",
      resourceId: "page-on-A",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
  });

  it("returns success with session and siteId when authorized", async () => {
    currentSession = makeSession("user-a");
    memberships["user-a"] = new Set([SITE_A]);
    const { authorizeResourceForCurrentSession } = await import("@/lib/authz");

    const result = await authorizeResourceForCurrentSession({
      feature: "content",
      action: "view",
      resourceType: "page",
      resourceId: "page-on-A",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.siteId).toBe(SITE_A);
      expect(result.session).toBeDefined();
    }
  });
});
