import { describe, it, expect } from "vitest";
import { injectProductLinks } from "@/lib/internal-links";
import type { ProductRow } from "@/types/database";

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "1",
    site_id: "site-1",
    name: "Test Product",
    slug: "test-product",
    description: "",
    affiliate_url: "https://example.com/buy",
    image_url: "",
    image_alt: "",
    price: "$10",
    price_amount: 10,
    price_currency: "USD",
    merchant: "",
    score: null,
    featured: false,
    status: "active",
    category_id: null,
    cta_text: "",
    deal_text: "",
    deal_expires_at: null,
    pros: "",
    cons: "",
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("injectProductLinks", () => {
  it("returns html unchanged when no products", () => {
    expect(injectProductLinks("<p>Hello</p>", [])).toBe("<p>Hello</p>");
  });

  it("returns html unchanged when html is empty", () => {
    expect(injectProductLinks("", [makeProduct()])).toBe("");
  });

  it("links the first occurrence of a product name with direct URL by default", () => {
    const html = "<p>Check out Test Product today.</p>";
    const result = injectProductLinks(html, [makeProduct()]);
    expect(result).toContain('href="https://example.com/buy"');
    expect(result).toContain(">Test Product</a>");
  });

  it("uses tracking URL when consent is given", () => {
    const html = "<p>Check out Test Product today.</p>";
    const result = injectProductLinks(html, [makeProduct()], true);
    expect(result).toContain('href="/api/track/click?p=test-product&t=inline"');
    expect(result).toContain(">Test Product</a>");
  });

  it("links both first and last occurrences", () => {
    const html =
      "<p>Test Product is great.</p><p>Middle section.</p><p>Buy Test Product now.</p>";
    const result = injectProductLinks(html, [makeProduct()], true);
    const linkCount = (result.match(/\/api\/track\/click/g) || []).length;
    expect(linkCount).toBe(2);
  });

  it("links only once when there is a single occurrence", () => {
    const html = "<p>Buy Test Product now.</p>";
    const result = injectProductLinks(html, [makeProduct()], true);
    const linkCount = (result.match(/\/api\/track\/click/g) || []).length;
    expect(linkCount).toBe(1);
  });

  it("skips product names shorter than 3 characters", () => {
    const product = makeProduct({ name: "AB" });
    const html = "<p>AB is short.</p>";
    expect(injectProductLinks(html, [product])).toBe(html);
  });

  it("skips products without affiliate_url", () => {
    const product = makeProduct({ affiliate_url: "" });
    const html = "<p>Test Product here.</p>";
    expect(injectProductLinks(html, [product])).toBe(html);
  });

  it("does not create nested anchors but links text outside anchors", () => {
    const html =
      '<p><a href="/existing">Test Product</a> is mentioned again as Test Product.</p>';
    const result = injectProductLinks(html, [makeProduct()], true);
    // Should have the original anchor plus one new link for text outside
    const anchorCount = (result.match(/<a /g) || []).length;
    expect(anchorCount).toBe(2);
    // The existing anchor should be preserved
    expect(result).toContain('href="/existing"');
    // The new link should be an affiliate tracking link
    expect(result).toContain("/api/track/click?p=test-product");
  });
});
