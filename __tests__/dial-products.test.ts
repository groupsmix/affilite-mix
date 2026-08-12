import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultDialConfig } from "@/lib/dial-config";
import { dialRatingToProductScore, resolveDialWatches } from "@/lib/dial-products";

const defaultClientGetter = vi.hoisted(() => vi.fn());
const cacheStore = vi.hoisted(() => new Map<string, Promise<unknown>>());

vi.mock("@/lib/dal/dal-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/dal/dal-client")>("@/lib/dal/dal-client");
  return { ...actual, defaultDalClientGetter: defaultClientGetter };
});

vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => Promise<unknown>, keyParts: string[]) => {
    const key = keyParts.join(":");
    return async (...args: unknown[]) => {
      const cached = cacheStore.get(key);
      if (cached) return cached;
      const result = fn(...args);
      cacheStore.set(key, result);
      return result;
    };
  },
}));

function clientFor(
  products: unknown[],
  links: unknown[] = [],
): Parameters<typeof resolveDialWatches>[2] {
  const tables = { products, product_affiliate_links: links };
  return async () =>
    ({
      from(table: "products" | "product_affiliate_links") {
        const result = tables[table];
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: result, error: null }).then(resolve),
        };
        return builder;
      },
    }) as never;
}

function failingClient(tableToFail: "products" | "product_affiliate_links") {
  return async () =>
    ({
      from(table: "products" | "product_affiliate_links") {
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({
              data: null,
              error: table === tableToFail ? new Error(`${table} unavailable`) : null,
            }).then(resolve),
        };
        return builder;
      },
    }) as never;
}

describe("Dial product resolution", () => {
  beforeEach(() => {
    defaultClientGetter.mockReset();
    cacheStore.clear();
  });

  it("converts the five-point rating scale to the product ten-point scale", () => {
    expect(dialRatingToProductScore(4.8)).toBe(9.6);
    expect(dialRatingToProductScore(4.7)).toBe(9.4);
  });

  it("uses DB price and destination for all seven matching watches", async () => {
    const products = defaultDialConfig.watches.map((watch, index) => ({
      id: `product-${index}`,
      slug: watch.id,
      price_amount: watch.price + 10,
      price_currency: "USD",
      affiliate_url: `https://www.amazon.com/dp/db-${index}?tag=ours-20`,
      status: "active",
    }));
    const links = products.map((product) => ({
      id: `link-${product.id}`,
      product_id: product.id,
      network: "amazon",
      geo: "*",
      url: product.affiliate_url,
      weight: 100,
      is_active: true,
    }));

    const resolved = await resolveDialWatches(
      "watch-tools",
      defaultDialConfig,
      clientFor(products, links),
    );

    expect(resolved.watches).toHaveLength(7);
    for (const [index, watch] of resolved.watches.entries()) {
      expect(watch.price).toBe(defaultDialConfig.watches[index]!.price + 10);
      expect(watch.affiliateUrl).toContain(`db-${index}`);
    }
  });

  it("falls back to editorial config when no matching DB rows exist", async () => {
    const resolved = await resolveDialWatches("watch-tools", defaultDialConfig, clientFor([]));

    expect(resolved.watches).toEqual(defaultDialConfig.watches);
  });

  it("falls back when a DB destination is empty", async () => {
    const original = {
      ...defaultDialConfig.watches[0]!,
      affiliateUrl: "https://www.amazon.com/dp/editorial-fallback?tag=ours-20",
    };
    const config = {
      ...defaultDialConfig,
      watches: [original, ...defaultDialConfig.watches.slice(1)],
    };
    const resolved = await resolveDialWatches(
      "watch-tools",
      config,
      clientFor([
        {
          id: "product-1",
          slug: original.id,
          price_amount: 300,
          price_currency: "USD",
          affiliate_url: "",
          status: "active",
        },
      ]),
    );

    expect(resolved.watches[0]!.price).toBe(300);
    expect(resolved.watches[0]!.affiliateUrl).toBe(original.affiliateUrl);
    expect(resolved.watches[0]!.editorNote).toBe(original.editorNote);
  });

  it("fails open to editorial values when either operational query fails", async () => {
    const config = {
      ...defaultDialConfig,
      watches: [defaultDialConfig.watches[0]!],
    };

    await expect(
      resolveDialWatches("dial-products-error", config, failingClient("products")),
    ).resolves.toEqual(config);
    await expect(
      resolveDialWatches("dial-links-error", config, failingClient("product_affiliate_links")),
    ).resolves.toEqual(config);
  });

  it("caches reads per site without crossing tenant boundaries", async () => {
    const watch = defaultDialConfig.watches[0]!;
    const from = vi.fn();
    const client = {
      from(table: "products" | "product_affiliate_links") {
        from(table);
        const rows =
          table === "products"
            ? [
                {
                  id: "cached-product",
                  slug: watch.id,
                  price_amount: 321,
                  price_currency: "USD",
                  affiliate_url: "https://www.amazon.com/dp/cached?tag=ours-20",
                  status: "active",
                },
              ]
            : [];
        const builder = {
          select: () => builder,
          eq: () => builder,
          in: () => builder,
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null }).then(resolve),
        };
        return builder;
      },
    };
    defaultClientGetter.mockResolvedValue(client as never);
    const config = { ...defaultDialConfig, watches: [watch] };

    const first = await resolveDialWatches("cache-site-a", config);
    const second = await resolveDialWatches("cache-site-a", config);
    const otherSite = await resolveDialWatches("cache-site-b", config);

    expect(first.watches[0]!.price).toBe(321);
    expect(second.watches[0]!.price).toBe(321);
    expect(otherSite.watches[0]!.price).toBe(321);
    expect(from).toHaveBeenCalledTimes(4);
    expect(from).toHaveBeenNthCalledWith(1, "products");
    expect(from).toHaveBeenNthCalledWith(2, "product_affiliate_links");
    expect(from).toHaveBeenNthCalledWith(3, "products");
    expect(from).toHaveBeenNthCalledWith(4, "product_affiliate_links");
  });
});
