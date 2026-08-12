import { describe, expect, it } from "vitest";
import type { AffiliateLinkHealthRow } from "@/types/database";
import {
  chooseCandidates,
  chooseNetworkSwitch,
  deterministicOptimizationKey,
  hasSampleFloor,
  isDeadWeight,
  isEpcFresh,
  isWinnerPromotion,
  OPTIMIZATION_ACTION_CAP,
} from "@/lib/automation/optimization";

function product(
  productId: string,
  overrides: Partial<Parameters<typeof chooseCandidates>[0][number]> = {},
) {
  return {
    productId,
    siteId: "site",
    categoryId: "category",
    groupKey: null,
    featured: false,
    active: true,
    clicks: 100,
    commissions: 1,
    epc: 1,
    network: "network-a",
    ...overrides,
  };
}

function health(
  productId: string,
  url: string,
  classification: AffiliateLinkHealthRow["classification"],
): AffiliateLinkHealthRow {
  return {
    id: `${productId}-health`,
    site_id: "site",
    product_id: productId,
    product_affiliate_link_id: null,
    source_type: "product",
    source_key: productId,
    source_name: "Product",
    url,
    network: "network-a",
    last_probed_at: null,
    last_http_status: null,
    final_url: null,
    baseline_registrable_domain: null,
    latency_ms: null,
    consecutive_failures: 1,
    failure_streak_started_at: null,
    classification,
    created_at: "",
    updated_at: "",
  };
}

describe("affiliate optimization rules", () => {
  it("uses inclusive decision boundaries", () => {
    expect(hasSampleFloor(99)).toBe(false);
    expect(hasSampleFloor(100)).toBe(true);
    expect(isDeadWeight(199, 0)).toBe(false);
    expect(isDeadWeight(200, 0)).toBe(true);
    expect(isDeadWeight(200, 0.01)).toBe(false);
    expect(isWinnerPromotion(1.49, 1)).toBe(false);
    expect(isWinnerPromotion(1.5, 1)).toBe(true);
  });

  it("rejects stale EPC and derives deterministic retry keys", () => {
    const now = Date.parse("2026-01-03T00:00:00.000Z");
    expect(isEpcFresh("2026-01-01T00:00:00.000Z", now)).toBe(true);
    expect(isEpcFresh("2025-12-31T23:59:59.000Z", now)).toBe(false);
    expect(deterministicOptimizationKey("2026-01-03", "product", "products.update")).toBe(
      "optimize:2026-01-03:product:products.update",
    );
  });

  it("uses page groups, falls back to category, and keeps promotion pairs atomic", () => {
    const candidates = chooseCandidates(
      [
        product("featured", { featured: true, epc: 1, groupKey: "page-a" }),
        product("winner", { epc: 1.5, groupKey: "page-a" }),
        product("other-page", { featured: true, epc: 1, groupKey: "page-b" }),
        product("category-winner", { epc: 2, groupKey: null }),
        product("category-featured", { featured: true, epc: 1, groupKey: null }),
      ],
      new Map(),
    );
    expect(
      candidates.filter((candidate) => candidate.actionType === "products.update"),
    ).toHaveLength(4);
    expect(candidates.find((candidate) => candidate.productId === "winner")).toBeDefined();
    expect(candidates.find((candidate) => candidate.productId === "featured")).toBeDefined();

    const capped = chooseCandidates(
      Array.from({ length: 6 }, (_, index) =>
        product(`dead-${index}`, { clicks: 200, commissions: 0 }),
      ),
      new Map(),
    );
    expect(capped).toHaveLength(OPTIMIZATION_ACTION_CAP);

    const pairAtBoundary = chooseCandidates(
      [
        product("featured-pair", { featured: true, epc: 1, groupKey: "pair" }),
        product("winner-pair", { epc: 2, groupKey: "pair" }),
        product("dead", { clicks: 200, commissions: 0 }),
        product("dead-2", { clicks: 200, commissions: 0 }),
      ],
      new Map(),
    );
    expect(pairAtBoundary.filter((candidate) => candidate.productId.includes("pair"))).toHaveLength(
      2,
    );
  });

  it("prioritizes destination fixes and allows only one proposal per product", () => {
    const candidates = chooseCandidates(
      [
        product("leak", { clicks: 200, commissions: 0 }),
        product("featured", { featured: true, epc: 1, groupKey: "page" }),
        product("winner", { epc: 2, groupKey: "page" }),
      ],
      new Map([
        ["leak", { url: "https://alternate.example", reason: "Current destination is broken" }],
      ]),
    );
    expect(candidates[0]!.actionType).toBe("products.update_affiliate_url");
    expect(candidates.filter((candidate) => candidate.productId === "leak")).toHaveLength(1);
    expect(
      candidates.find((candidate) => candidate.actionType === "products.archive"),
    ).toBeUndefined();
  });

  it("switches on a 1.5x alternate network EPC threshold", () => {
    const links = [
      { url: "https://a.example", network: "network-a" },
      { url: "https://b.example", network: "network-b" },
    ];
    expect(
      chooseNetworkSwitch(
        links[0]!.url,
        links,
        [
          { network: "network-a", clicks: 100, epc: 1 },
          { network: "network-b", clicks: 100, epc: 1.49 },
        ],
        [],
      ),
    ).toBeNull();
    expect(
      chooseNetworkSwitch(
        links[0]!.url,
        links,
        [
          { network: "network-a", clicks: 100, epc: 1 },
          { network: "network-b", clicks: 100, epc: 1.5 },
        ],
        [],
      )?.url,
    ).toBe(links[1]!.url);
  });

  it("switches immediately when the current destination is broken or suspicious", () => {
    const links = [
      { url: "https://a.example", network: "network-a" },
      { url: "https://b.example", network: "network-b" },
    ];
    expect(
      chooseNetworkSwitch(
        links[0]!.url,
        links,
        [],
        [health("product", links[0]!.url, "suspicious")],
      )?.url,
    ).toBe(links[1]!.url);
  });
});
