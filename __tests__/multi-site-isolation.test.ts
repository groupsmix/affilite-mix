/**
 * Regression tests for the multi-site isolation audit fixes:
 *  1. Newsletter unsubscribe POST must NOT trust a body-supplied site_id.
 *  2. content_products mutations must verify content + products belong to
 *     the caller's site.
 *  3. Cache revalidation tags must be namespaced per-site.
 *  4. toSiteRow must honour SiteDefinition.monetization.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── Site-scoped cache tags ───────────────────────────────────────

describe("site-scoped cache tags", () => {
  it("produces per-site tag namespaces", async () => {
    const { contentTag, productsTag, categoriesTag, allSiteTags, siteTag } =
      await import("@/lib/cache-tags");

    expect(contentTag("watch-tools")).toBe("site:watch-tools:content");
    expect(productsTag("crypto-tools")).toBe("site:crypto-tools:products");
    expect(categoriesTag("ai-compared")).toBe("site:ai-compared:categories");
    expect(siteTag("content", "arabic-tools")).toBe("site:arabic-tools:content");

    expect(allSiteTags("foo")).toEqual([
      "site:foo:content",
      "site:foo:products",
      "site:foo:categories",
    ]);
  });

  it("never collides across sites for the same kind", async () => {
    const { contentTag } = await import("@/lib/cache-tags");
    expect(contentTag("site-a")).not.toBe(contentTag("site-b"));
  });

  it("throws if slug is empty (fail-closed)", async () => {
    const { contentTag } = await import("@/lib/cache-tags");
    expect(() => contentTag("")).toThrow();
  });
});

// ── toSiteRow monetization ──────────────────────────────────────

describe("toSiteRow monetization", () => {
  it("defaults to 'affiliate' when no override is provided", async () => {
    const { toSiteRow } = await import("@/config/sites");
    const { defineSite } = await import("@/config/define-site");
    const site = defineSite({
      id: "test-site-aff",
      name: "Affiliate Only",
      domain: "aff.example.com",
      niche: "reviews",
      colors: { primary: "#000", accent: "#111" },
    });
    expect(toSiteRow(site).monetization_type).toBe("affiliate");
  });

  it("honours SiteDefinition.monetization=ads", async () => {
    const { toSiteRow } = await import("@/config/sites");
    const { defineSite } = await import("@/config/define-site");
    const site = defineSite({
      id: "test-site-ads",
      name: "Ads Only",
      domain: "ads.example.com",
      niche: "news",
      colors: { primary: "#000", accent: "#111" },
      monetization: "ads",
    });
    expect(toSiteRow(site).monetization_type).toBe("ads");
  });

  it("honours SiteDefinition.monetization=both", async () => {
    const { toSiteRow } = await import("@/config/sites");
    const { defineSite } = await import("@/config/define-site");
    const site = defineSite({
      id: "test-site-both",
      name: "Mixed",
      domain: "mixed.example.com",
      niche: "deals",
      colors: { primary: "#000", accent: "#111" },
      monetization: "both",
    });
    expect(toSiteRow(site).monetization_type).toBe("both");
  });
});

// ── Newsletter unsubscribe: trust boundary ──────────────────────

describe("POST /api/newsletter/unsubscribe trust boundary", () => {
  // Capture the site_id that actually reached Supabase.
  let eqCalls: { column: string; value: unknown }[] = [];
  const mockUpdate = vi.fn(() => {
    const chain = {
      eq: (column: string, value: unknown) => {
        eqCalls.push({ column, value });
        return chain;
      },
    };
    return chain;
  });

  beforeEach(() => {
    eqCalls = [];
    vi.resetModules();

    vi.doMock("@/lib/rate-limit", () => ({
      checkRateLimit: vi.fn().mockResolvedValue({
        allowed: true,
        remaining: 10,
        retryAfterMs: 0,
      }),
    }));

    vi.doMock("@/lib/sentry", () => ({
      captureException: vi.fn(),
    }));

    vi.doMock("@/lib/get-client-ip", () => ({
      getClientIp: () => "127.0.0.1",
    }));

    vi.doMock("@/lib/supabase-server", () => ({
      getServiceClient: () => ({
        from: () => ({
          update: (...args: unknown[]) => mockUpdate(...args),
        }),
      }),
    }));

    vi.doMock("@/lib/site-context", () => ({
      getCurrentSite: vi.fn().mockResolvedValue({
        id: "server-resolved-slug",
        monetization: "affiliate",
      }),
    }));

    vi.doMock("@/lib/dal/site-resolver", () => ({
      resolveDbSiteId: vi.fn().mockResolvedValue("SERVER_TRUSTED_UUID"),
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/rate-limit");
    vi.doUnmock("@/lib/sentry");
    vi.doUnmock("@/lib/get-client-ip");
    vi.doUnmock("@/lib/supabase-server");
    vi.doUnmock("@/lib/site-context");
    vi.doUnmock("@/lib/dal/site-resolver");
  });

  it("ignores a client-supplied site_id and uses the server-resolved site", async () => {
    const { POST } = await import("@/app/api/newsletter/unsubscribe/route");
    const req = new Request("http://localhost/api/newsletter/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "user@example.com",
        site_id: "ATTACKER_SUPPLIED_UUID",
      }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);

    const siteIdCalls = eqCalls.filter((c) => c.column === "site_id");
    expect(siteIdCalls).toHaveLength(1);
    expect(siteIdCalls[0]?.value).toBe("SERVER_TRUSTED_UUID");
    expect(siteIdCalls[0]?.value).not.toBe("ATTACKER_SUPPLIED_UUID");
  });

  it("returns 400 when email is missing (no site_id required from body)", async () => {
    const { POST } = await import("@/app/api/newsletter/unsubscribe/route");
    const req = new Request("http://localhost/api/newsletter/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});

// ── content_products isolation ──────────────────────────────────

describe("setLinkedProducts site isolation", () => {
  const calls = {
    delete: vi.fn(),
    insert: vi.fn(),
  };

  beforeEach(() => {
    vi.resetModules();
    calls.delete.mockReset();
    calls.insert.mockReset();
  });

  function mockSupabase(opts: { contentRow: { id: string } | null; ownedProductIds: string[] }) {
    vi.doMock("@/lib/supabase-server", () => ({
      getServiceClient: () => ({
        from: (table: string) => {
          if (table === "content") {
            return {
              select: () => ({
                eq: () => ({
                  eq: () => ({
                    maybeSingle: () => Promise.resolve({ data: opts.contentRow, error: null }),
                  }),
                }),
              }),
            };
          }
          if (table === "products") {
            return {
              select: () => ({
                eq: () => ({
                  in: () =>
                    Promise.resolve({
                      data: opts.ownedProductIds.map((id) => ({ id })),
                      error: null,
                    }),
                }),
              }),
            };
          }
          // content_products
          return {
            delete: () => ({
              eq: (...args: unknown[]) => {
                calls.delete(...args);
                return Promise.resolve({ error: null });
              },
            }),
            insert: (rows: unknown) => {
              calls.insert(rows);
              return Promise.resolve({ error: null });
            },
          };
        },
      }),
    }));
  }

  it("rejects when content does not belong to the caller's site", async () => {
    mockSupabase({ contentRow: null, ownedProductIds: ["p1"] });
    const { setLinkedProducts } = await import("@/lib/dal/content-products");

    await expect(
      setLinkedProducts("attacker-content-uuid", "site-a-uuid", [
        { product_id: "p1", rank: 1, context: null },
      ]),
    ).rejects.toThrow(/Content not found for this site/);

    expect(calls.delete).not.toHaveBeenCalled();
    expect(calls.insert).not.toHaveBeenCalled();
  });

  it("rejects when any product does not belong to the caller's site", async () => {
    mockSupabase({ contentRow: { id: "c1" }, ownedProductIds: ["p1"] });
    const { setLinkedProducts } = await import("@/lib/dal/content-products");

    await expect(
      setLinkedProducts("c1", "site-a-uuid", [
        { product_id: "p1", rank: 1, context: null },
        { product_id: "foreign-product", rank: 2, context: null },
      ]),
    ).rejects.toThrow(/One or more products do not belong to this site/);

    expect(calls.delete).not.toHaveBeenCalled();
    expect(calls.insert).not.toHaveBeenCalled();
  });

  it("accepts when content and every product belong to the caller's site", async () => {
    mockSupabase({ contentRow: { id: "c1" }, ownedProductIds: ["p1", "p2"] });
    const { setLinkedProducts } = await import("@/lib/dal/content-products");

    await setLinkedProducts("c1", "site-a-uuid", [
      { product_id: "p1", rank: 1, context: null },
      { product_id: "p2", rank: 2, context: null },
    ]);

    expect(calls.delete).toHaveBeenCalledTimes(1);
    expect(calls.insert).toHaveBeenCalledTimes(1);
  });

  it("skips insert when links array is empty but still verifies ownership", async () => {
    mockSupabase({ contentRow: { id: "c1" }, ownedProductIds: [] });
    const { setLinkedProducts } = await import("@/lib/dal/content-products");

    await setLinkedProducts("c1", "site-a-uuid", []);

    expect(calls.delete).toHaveBeenCalledTimes(1);
    expect(calls.insert).not.toHaveBeenCalled();
  });
});
