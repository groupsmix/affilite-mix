import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listUnhealthyAffiliateLinks: vi.fn(),
}));

vi.mock("@/lib/admin-guard", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/dal/affiliate-link-health", () => ({
  listUnhealthyAffiliateLinks: mocks.listUnhealthyAffiliateLinks,
}));

import { GET } from "@/app/api/admin/affiliate-link-health/route";

describe("GET /api/admin/affiliate-link-health", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue({
      error: null,
      dbSiteId: "site-a",
      siteSlug: "site-a",
      session: { role: "admin" },
      caller: { type: "interactive" },
    });
    mocks.listUnhealthyAffiliateLinks.mockResolvedValue([]);
  });

  it("lists only the active site's unhealthy destinations", async () => {
    const response = await GET(
      new NextRequest("https://example.com/api/admin/affiliate-link-health?limit=10"),
    );
    expect(response.status).toBe(200);
    expect(mocks.listUnhealthyAffiliateLinks).toHaveBeenCalledWith("site-a", {
      limit: 10,
      offset: 0,
    });
  });

  it("returns a server error when the health query fails", async () => {
    mocks.listUnhealthyAffiliateLinks.mockRejectedValue(new Error("db unavailable"));
    const response = await GET(
      new NextRequest("https://example.com/api/admin/affiliate-link-health"),
    );
    expect(response.status).toBe(500);
  });
});
