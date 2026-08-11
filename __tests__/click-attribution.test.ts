/**
 * Per-click commission attribution.
 *
 * The outbound redirect appends an opaque reference to the network tracking
 * value (`<site key>-r<ref>`, or the bare reference on Amazon's `ascsubtag`),
 * and commission ingestion splits it back off to resolve the click and product
 * while keeping site resolution — including for tracking keys minted before
 * this contract existed — unchanged.
 */
import { describe, expect, it, vi } from "vitest";
import {
  CLICK_REF_LENGTH,
  MAX_TRACKING_VALUE_LENGTH,
  generateClickRef,
  isValidClickRef,
  parseTrackingValue,
  withClickRef,
} from "@/lib/affiliate/click-attribution";
import { attributeCommissions } from "@/lib/affiliate/commission-attribution";
import { getSubIdParamForNetwork } from "@/lib/affiliate/networks";
import type { ResolvedClickAttribution } from "@/lib/dal/affiliate-clicks";

describe("click reference generation", () => {
  it("produces distinct lowercase hex references of the advertised length", () => {
    const refs = new Set(Array.from({ length: 200 }, () => generateClickRef()));
    expect(refs.size).toBe(200);
    for (const ref of refs) {
      expect(ref).toMatch(new RegExp(`^[0-9a-f]{${CLICK_REF_LENGTH}}$`));
      expect(isValidClickRef(ref)).toBe(true);
    }
  });

  it("rejects references that are not exactly the generated shape", () => {
    expect(isValidClickRef("")).toBe(false);
    expect(isValidClickRef("9F3C1A7B2E5D0846")).toBe(false);
    expect(isValidClickRef("9f3c1a7b2e5d084")).toBe(false);
    expect(isValidClickRef("9f3c1a7b2e5d0846x")).toBe(false);
    expect(isValidClickRef("../../etc/passwd")).toBe(false);
  });
});

describe("composing a tracking value", () => {
  const ref = "9f3c1a7b2e5d0846";

  it("appends the reference behind the site key", () => {
    expect(withClickRef("wristnerd42", ref)).toBe(`wristnerd42-r${ref}`);
  });

  it("round-trips back into site key and reference", () => {
    expect(parseTrackingValue(withClickRef("wristnerd42", ref)!)).toEqual({
      trackingKey: "wristnerd42",
      clickRef: ref,
    });
  });

  it("keeps the site key unattributed rather than exceeding the network cap", () => {
    const longKey = "k".repeat(MAX_TRACKING_VALUE_LENGTH - CLICK_REF_LENGTH - 1);
    expect(withClickRef(longKey, ref)).toBeNull();
    const fittingKey = "k".repeat(MAX_TRACKING_VALUE_LENGTH - CLICK_REF_LENGTH - 2);
    expect(withClickRef(fittingKey, ref)).toHaveLength(MAX_TRACKING_VALUE_LENGTH);
  });

  it("refuses to compose without a site key or with a forged reference", () => {
    expect(withClickRef("", ref)).toBeNull();
    expect(withClickRef("wristnerd42", "not-a-ref")).toBeNull();
  });
});

describe("parsing a reported tracking value", () => {
  it("treats a legacy site key as a site key with no click", () => {
    expect(parseTrackingValue("wristnerd42")).toEqual({
      trackingKey: "wristnerd42",
      clickRef: null,
    });
  });

  it("treats a site key that merely looks decorated as a legacy key", () => {
    expect(parseTrackingValue("promo-r2026")).toEqual({
      trackingKey: "promo-r2026",
      clickRef: null,
    });
  });

  it("reads a bare reference from a dedicated sub-id parameter", () => {
    expect(parseTrackingValue("9f3c1a7b2e5d0846")).toEqual({
      trackingKey: "",
      clickRef: "9f3c1a7b2e5d0846",
    });
  });
});

describe("network sub-id parameters", () => {
  it("shares the publisher key parameter on networks that allow a subid there", () => {
    expect(getSubIdParamForNetwork("cj")).toEqual({ param: "sid", sharedWithTrackingKey: true });
    expect(getSubIdParamForNetwork("awin")).toEqual({
      param: "clickref",
      sharedWithTrackingKey: true,
    });
  });

  it("keeps Amazon's associate tag untouched and uses ascsubtag instead", () => {
    expect(getSubIdParamForNetwork("amazon")).toEqual({
      param: "ascsubtag",
      sharedWithTrackingKey: false,
    });
  });

  it("returns nothing for networks with no tracking parameter", () => {
    expect(getSubIdParamForNetwork("walmart")).toBeNull();
  });
});

// ── Commission attribution ─────────────────────────────────────────

interface Report {
  network: string;
  tracking_key: string;
  order_id: string;
  click_id?: string;
  product_id?: string;
}

function makeDeps(
  sites: Record<string, string>,
  clicks: Record<string, ResolvedClickAttribution> = {},
) {
  return {
    resolveSites: vi.fn(async (_network: string, keys: string[]) => {
      const resolvedSites = new Map<string, string>();
      for (const key of keys) {
        const siteId = sites[key];
        if (siteId) resolvedSites.set(key, siteId);
      }
      return resolvedSites;
    }),
    resolveClicks: vi.fn(async (refs: string[]) => {
      const resolvedClicks = new Map<string, ResolvedClickAttribution>();
      for (const ref of refs) {
        const click = clicks[ref];
        if (click) resolvedClicks.set(ref, click);
      }
      return resolvedClicks;
    }),
  };
}

describe("attributeCommissions", () => {
  const ref = "9f3c1a7b2e5d0846";

  it("attributes a reported reference to its click and product", async () => {
    const deps = makeDeps(
      { wristnerd42: "site-1" },
      { [ref]: { click_id: "click-1", site_id: "site-1", product_id: "product-1" } },
    );

    const { resolved, unresolved } = await attributeCommissions<Report>(
      [{ network: "cj", tracking_key: `wristnerd42-r${ref}`, order_id: "o-1" }],
      deps,
    );

    expect(unresolved).toEqual([]);
    expect(resolved[0]).toMatchObject({
      site_id: "site-1",
      click_id: "click-1",
      product_id: "product-1",
    });
  });

  it("resolves the site from the click alone when only a bare reference is reported", async () => {
    const deps = makeDeps(
      {},
      { [ref]: { click_id: "click-1", site_id: "site-1", product_id: "product-1" } },
    );

    const { resolved } = await attributeCommissions<Report>(
      [{ network: "amazon", tracking_key: ref, order_id: "o-1" }],
      deps,
    );

    expect(resolved[0]).toMatchObject({
      site_id: "site-1",
      click_id: "click-1",
      product_id: "product-1",
    });
  });

  it("keeps site-level attribution for a legacy tracking key", async () => {
    const deps = makeDeps({ wristnerd42: "site-1" });

    const { resolved } = await attributeCommissions<Report>(
      [{ network: "cj", tracking_key: "wristnerd42", order_id: "o-1" }],
      deps,
    );

    expect(resolved[0]).toMatchObject({ site_id: "site-1" });
    expect(resolved[0]).not.toHaveProperty("click_id");
    expect(resolved[0]).not.toHaveProperty("product_id");
    expect(deps.resolveClicks).toHaveBeenCalledWith([]);
  });

  it("still attributes the site when the reference matches no stored click", async () => {
    const deps = makeDeps({ wristnerd42: "site-1" });

    const { resolved, unresolved } = await attributeCommissions<Report>(
      [{ network: "cj", tracking_key: `wristnerd42-r${ref}`, order_id: "o-1" }],
      deps,
    );

    expect(unresolved).toEqual([]);
    expect(resolved[0]).toMatchObject({ site_id: "site-1" });
    expect(resolved[0]).not.toHaveProperty("click_id");
  });

  it("never carries a click across sites", async () => {
    const deps = makeDeps(
      { wristnerd42: "site-1" },
      { [ref]: { click_id: "click-1", site_id: "site-2", product_id: "product-2" } },
    );

    const { resolved } = await attributeCommissions<Report>(
      [{ network: "cj", tracking_key: `wristnerd42-r${ref}`, order_id: "o-1" }],
      deps,
    );

    expect(resolved[0]).toMatchObject({ site_id: "site-1" });
    expect(resolved[0]).not.toHaveProperty("click_id");
  });

  it("prefers attribution the network itself reported", async () => {
    const deps = makeDeps(
      { wristnerd42: "site-1" },
      { [ref]: { click_id: "click-1", site_id: "site-1", product_id: "product-1" } },
    );

    const { resolved } = await attributeCommissions<Report>(
      [
        {
          network: "cj",
          tracking_key: `wristnerd42-r${ref}`,
          order_id: "o-1",
          click_id: "network-click",
          product_id: "network-product",
        },
      ],
      deps,
    );

    expect(resolved[0]).toMatchObject({
      click_id: "network-click",
      product_id: "network-product",
    });
  });

  it("discards a report whose key resolves to neither a site nor a click", async () => {
    const deps = makeDeps({});

    const { resolved, unresolved } = await attributeCommissions<Report>(
      [{ network: "cj", tracking_key: `unknown-r${ref}`, order_id: "o-1" }],
      deps,
    );

    expect(resolved).toEqual([]);
    expect(unresolved).toHaveLength(1);
  });

  it("looks a tracking value up both as reported and as a split prefix", async () => {
    const deps = makeDeps({ wristnerd42: "site-1" });

    await attributeCommissions<Report>(
      [{ network: "cj", tracking_key: `wristnerd42-r${ref}`, order_id: "o-1" }],
      deps,
    );

    expect(deps.resolveSites).toHaveBeenCalledWith("cj", [`wristnerd42-r${ref}`, "wristnerd42"]);
  });
});
