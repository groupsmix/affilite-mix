import { describe, expect, it } from "vitest";
import {
  parseProductAffiliateUrlInput,
  parseProductLifecycleInput,
  parseProductUpdateInput,
} from "@/lib/automation/schemas";

const id = "11111111-1111-1111-1111-111111111111";

describe("product automation schemas", () => {
  it("allows metadata but rejects affiliate and lifecycle fields", () => {
    expect(
      parseProductUpdateInput({ product_id: id, updates: { name: "New", price_amount: 12 } }).ok,
    ).toBe(true);
    expect(
      parseProductUpdateInput({ product_id: id, updates: { affiliate_url: "https://evil.test" } })
        .ok,
    ).toBe(false);
    expect(parseProductUpdateInput({ product_id: id, updates: { status: "active" } }).ok).toBe(
      false,
    );
    expect(
      parseProductUpdateInput({ product_id: id, updates: { name: "New" }, extra: true }).ok,
    ).toBe(false);
  });

  it("validates URL and lifecycle payloads", () => {
    expect(
      parseProductAffiliateUrlInput({ product_id: id, affiliate_url: "https://amazon.com/item" })
        .ok,
    ).toBe(true);
    expect(
      parseProductAffiliateUrlInput({
        product_id: id,
        affiliate_url: "https://amazon.com/item",
        status: "active",
      }).ok,
    ).toBe(false);
    expect(parseProductLifecycleInput({ product_id: id }).ok).toBe(true);
    expect(parseProductLifecycleInput({ product_id: id, status: "active" }).ok).toBe(false);
  });

  it("requires image_url to be an absolute HTTP(S) URL", () => {
    expect(parseProductUpdateInput({ product_id: id, image_url: "/relative/image.jpg" }).ok).toBe(
      false,
    );
    expect(
      parseProductUpdateInput({ product_id: id, image_url: "https://cdn.example.com/image.jpg" })
        .ok,
    ).toBe(true);
  });

  it("allows clearing deal_expires_at with null", () => {
    const result = parseProductUpdateInput({
      product_id: id,
      updates: { deal_expires_at: null },
    });
    expect(result).toEqual({
      ok: true,
      value: { product_id: id, updates: { deal_expires_at: null } },
    });
  });
});
