/**
 * Route-layer tests for /api/admin/presentations: auth gating, draft save
 * sanitisation, and the publish/rollback lifecycle actions (which must
 * invalidate the site cache only after a successful write).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  assertRole: vi.fn(),
  upsertDraftPresentation: vi.fn(),
  publishPresentation: vi.fn(),
  rollbackPresentation: vi.fn(),
  getDraftPresentation: vi.fn(),
  getPublishedPresentation: vi.fn(),
  listArchivedPresentations: vi.fn(),
  revalidateTag: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({
  requireAdmin: mocks.requireAdmin,
  assertRole: mocks.assertRole,
}));
vi.mock("@/lib/dal/site-presentations", () => ({
  upsertDraftPresentation: mocks.upsertDraftPresentation,
  publishPresentation: mocks.publishPresentation,
  rollbackPresentation: mocks.rollbackPresentation,
  getDraftPresentation: mocks.getDraftPresentation,
  getPublishedPresentation: mocks.getPublishedPresentation,
  listArchivedPresentations: mocks.listArchivedPresentations,
  rowToPresentationSource: (r: unknown) => r,
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: mocks.recordAuditEvent }));
vi.mock("@/lib/sentry", () => ({ captureException: vi.fn() }));

import { PUT, POST, GET } from "@/app/api/admin/presentations/route";

const authed = {
  error: null,
  session: { role: "super_admin", email: "a@e.com", userId: "u1" },
  dbSiteId: "site-1",
  siteSlug: "wristnerd",
};

function jsonReq(body: unknown): NextRequest {
  return new NextRequest("https://x.test/api/admin/presentations", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue(authed);
  mocks.assertRole.mockReturnValue(null);
  mocks.upsertDraftPresentation.mockResolvedValue({ id: "p1" });
  mocks.publishPresentation.mockResolvedValue({ id: "p1", version: 2 });
  mocks.rollbackPresentation.mockResolvedValue({ id: "p0", version: 3 });
  mocks.getDraftPresentation.mockResolvedValue(null);
  mocks.getPublishedPresentation.mockResolvedValue(null);
  mocks.listArchivedPresentations.mockResolvedValue([]);
});

describe("auth gating", () => {
  it("returns the guard error when requireAdmin fails", async () => {
    mocks.requireAdmin.mockResolvedValue({
      error: new Response("no", { status: 401 }),
      session: null,
      dbSiteId: null,
      siteSlug: null,
    });
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("PUT (save draft)", () => {
  it("sanitises and persists the draft", async () => {
    const res = await PUT(
      jsonReq({ headerVariant: "magazine", headerConfig: { ctaLabel: "x".repeat(500) } }),
    );
    expect(res.status).toBe(200);
    expect(mocks.upsertDraftPresentation).toHaveBeenCalledTimes(1);
    const [, input] = mocks.upsertDraftPresentation.mock.calls[0]!;
    expect(input.headerVariant).toBe("magazine");
    expect(input.headerConfig.ctaLabel.length).toBeLessThanOrEqual(120);
  });
});

describe("POST (lifecycle)", () => {
  it("rejects an unknown action", async () => {
    const res = await POST(jsonReq({ action: "nope" }));
    expect(res.status).toBe(400);
    expect(mocks.publishPresentation).not.toHaveBeenCalled();
  });

  it("publishes then invalidates the presentation cache", async () => {
    const res = await POST(jsonReq({ action: "publish" }));
    expect(res.status).toBe(200);
    expect(mocks.publishPresentation).toHaveBeenCalledWith("site-1", "u1");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("presentation:site-1");
  });

  it("maps a missing-draft publish error to 409 without invalidating cache", async () => {
    mocks.publishPresentation.mockRejectedValue(new Error("no draft presentation to publish"));
    const res = await POST(jsonReq({ action: "publish" }));
    expect(res.status).toBe(409);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("rolls back to the previous version", async () => {
    const res = await POST(jsonReq({ action: "rollback" }));
    expect(res.status).toBe(200);
    expect(mocks.rollbackPresentation).toHaveBeenCalledWith("site-1", "u1");
    expect(mocks.revalidateTag).toHaveBeenCalledWith("presentation:site-1");
  });
});
