import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  verifyCronAuth: vi.fn(),
  getPrivilegedDalClient: vi.fn(),
  getCursor: vi.fn(),
  setCursor: vi.fn(),
  getHealth: vi.fn(),
  upsertHealth: vi.fn(),
  getDialConfig: vi.fn(),
  fetch: vi.fn(),
  sendAlerts: vi.fn(),
  recordLiveness: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/cron-auth", () => ({ verifyCronAuth: mocks.verifyCronAuth }));
vi.mock("@/lib/cron-registry", () => ({
  getCronAuthOptionsForPath: vi.fn(() => ({})),
}));
vi.mock("@/lib/dal/dal-client", () => ({
  getPrivilegedDalClient: mocks.getPrivilegedDalClient,
}));
vi.mock("@/lib/dal/affiliate-link-health", () => ({
  getAffiliateLinkHealthCursor: mocks.getCursor,
  setAffiliateLinkHealthCursor: mocks.setCursor,
  getAffiliateLinkHealth: mocks.getHealth,
  upsertAffiliateLinkHealth: mocks.upsertHealth,
}));
vi.mock("@/lib/dial-config", () => ({ getDialHomepageConfig: mocks.getDialConfig }));
vi.mock("@/lib/ssrf-guard", () => ({ safeFetchWithRedirectMetadata: mocks.fetch }));
vi.mock("@/lib/cron-liveness", () => ({ recordCronLiveness: mocks.recordLiveness }));
vi.mock("@/lib/sentry", () => ({ captureException: mocks.captureException }));
vi.mock("@/lib/affiliate-link-health-monitor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/affiliate-link-health-monitor")>(
    "@/lib/affiliate-link-health-monitor",
  );
  return { ...actual, sendAlerts: mocks.sendAlerts };
});

import { POST } from "@/app/api/cron/affiliate-link-health/route";
import { normalizeHealthCursor } from "@/lib/affiliate-link-health-monitor";

function query(data: unknown, error: null | Error = null) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve, reject),
  };
  return builder;
}

function setupClient({
  products = [],
  links = [],
  dialSites = [],
}: {
  products?: unknown[];
  links?: unknown[];
  dialSites?: unknown[];
} = {}) {
  const tables = {
    products: query(products),
    product_affiliate_links: query(links),
    sites: query(dialSites),
  };
  mocks.getPrivilegedDalClient.mockReturnValue({
    from: vi.fn((table: keyof typeof tables) => tables[table]),
  });
}

function request() {
  return new NextRequest("https://example.com/api/cron/affiliate-link-health", { method: "POST" });
}

describe("affiliate link health Dial targets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyCronAuth.mockReturnValue(true);
    mocks.getCursor.mockResolvedValue(null);
    mocks.setCursor.mockResolvedValue(undefined);
    mocks.getHealth.mockResolvedValue(null);
    mocks.upsertHealth.mockResolvedValue({});
    mocks.sendAlerts.mockResolvedValue(undefined);
    mocks.fetch.mockResolvedValue({
      status: 200,
      finalUrl: "https://www.amazon.com/dp/example",
      headers: {},
    });
    mocks.getDialConfig.mockResolvedValue({
      watches: [
        {
          id: "navigator-automatic",
          name: "Kamasu",
          brand: "Orient",
          affiliateUrl: "https://www.amazon.com/dp/example?tag=ours-20",
        },
        { id: "empty-watch", name: "Empty", brand: "Brand", affiliateUrl: "" },
      ],
    });
  });

  it("probes and reports a resolved Dial watch destination", async () => {
    setupClient({
      products: [],
      dialSites: [{ id: "dial-site", homepage_template: "dial", is_active: true }],
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledWith(
      "https://www.amazon.com/dp/example?tag=ours-20",
      expect.anything(),
    );
    expect(mocks.upsertHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        site_id: "dial-site",
        product_id: null,
        source_type: "dial_watch",
        source_key: "navigator-automatic",
        source_name: "Orient Kamasu",
      }),
    );
  });

  it("does not probe Dial data for a site without the Dial template", async () => {
    setupClient({
      products: [
        {
          id: "product",
          site_id: "standard-site",
          name: "Product",
          affiliate_url: "https://example.com",
        },
      ],
      links: [],
      dialSites: [],
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.upsertHealth).toHaveBeenCalledWith(
      expect.objectContaining({ source_type: "product", product_id: "product" }),
    );
    expect(mocks.getDialConfig).not.toHaveBeenCalled();
  });

  it("skips Dial watches whose resolved destination is empty", async () => {
    setupClient({
      products: [],
      dialSites: [{ id: "dial-site", homepage_template: "dial", is_active: true }],
    });

    await POST(request());

    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.upsertHealth).toHaveBeenCalledTimes(1);
    expect(mocks.upsertHealth).toHaveBeenCalledWith(
      expect.objectContaining({ source_key: "navigator-automatic" }),
    );
  });

  it("keeps primary and product-affiliate-link probing unchanged", async () => {
    setupClient({
      products: [
        {
          id: "product",
          site_id: "site",
          name: "Product",
          affiliate_url: "https://example.com/primary",
        },
      ],
      links: [
        {
          id: "link",
          product_id: "product",
          network: "sovrn",
          url: "https://example.com/affiliate",
          is_active: true,
        },
      ],
      dialSites: [],
    });

    await POST(request());

    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.upsertHealth).toHaveBeenCalledTimes(2);
    expect(mocks.upsertHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: "product",
        product_affiliate_link_id: "link",
        source_type: "product",
        source_key: "product",
      }),
    );
  });

  it("finishes product targets before Dial targets without skipping UUID ranges", async () => {
    const products = Array.from({ length: 40 }, (_, index) => ({
      id: `${index < 20 ? "a" : "f"}0000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
      site_id: "site",
      name: `Product ${index}`,
      affiliate_url: `https://example.com/product-${index}`,
    }));
    setupClient({
      products,
      dialSites: [{ id: "dial-site", homepage_template: "dial", is_active: true }],
    });
    let cursor: string | null = null;
    mocks.getCursor.mockImplementation(() => Promise.resolve(cursor));
    mocks.setCursor.mockImplementation((nextCursor: string | null) => {
      cursor = nextCursor;
      return Promise.resolve();
    });

    for (;;) {
      const response = await POST(request());
      expect(response.status).toBe(200);
      if (cursor === null) break;
    }

    const probedUrls = mocks.fetch.mock.calls.map(([url]) => url);
    expect(probedUrls).toHaveLength(41);
    expect(new Set(probedUrls).size).toBe(41);
    expect(probedUrls.filter((url) => String(url).includes("/product-"))).toHaveLength(40);
    expect(probedUrls).toContain("https://www.amazon.com/dp/example?tag=ours-20");
  });

  it("restarts from the beginning for a legacy cursor format", async () => {
    setupClient({
      products: [
        {
          id: "f0000000-0000-0000-0000-000000000001",
          site_id: "site",
          name: "Product",
          affiliate_url: "https://example.com/product",
        },
      ],
      dialSites: [{ id: "dial-site", homepage_template: "dial", is_active: true }],
    });
    mocks.getCursor.mockResolvedValue("dial:legacy-watch");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual(
      expect.arrayContaining([
        "https://example.com/product",
        "https://www.amazon.com/dp/example?tag=ours-20",
      ]),
    );
  });
});

describe("affiliate link health cursor format", () => {
  it("rejects legacy and malformed cursors", () => {
    expect(normalizeHealthCursor("f0000000-legacy")).toBeNull();
    expect(normalizeHealthCursor("dial:legacy:watch")).toBeNull();
    expect(normalizeHealthCursor("0:product:f0000000-0000-0000-0000-000000000001:primary")).toBe(
      "0:product:f0000000-0000-0000-0000-000000000001:primary",
    );
    expect(normalizeHealthCursor("1:dial:site:watch")).toBe("1:dial:site:watch");
  });
});
