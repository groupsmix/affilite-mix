import { describe, expect, it } from "vitest";
import { defaultDialConfig } from "@/lib/dial-config";
import { dialRatingToProductScore, resolveDialWatches } from "@/lib/dial-products";

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

describe("Dial product resolution", () => {
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
});
