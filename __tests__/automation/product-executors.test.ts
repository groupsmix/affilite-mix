import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dal/products", () => ({
  getProductById: vi.fn(),
  updateProduct: vi.fn(),
}));

import { getProductById, updateProduct } from "@/lib/dal/products";
import {
  executeProductActivate,
  executeProductAffiliateUrl,
  executeProductArchive,
  executeProductUpdate,
} from "@/lib/automation/executors/products";

const getProduct = getProductById as unknown as ReturnType<typeof vi.fn>;
const update = updateProduct as unknown as ReturnType<typeof vi.fn>;
const product = {
  id: "product-1",
  site_id: "site-1",
  name: "Product",
  affiliate_url: "https://amazon.com/item?tag=ours-20",
  status: "draft",
  version: 2,
};
const action = (payload: Record<string, unknown>) => ({ id: "action-1", payload }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  getProduct.mockResolvedValue(product);
  update.mockImplementation((_site: string, _id: string, input: Record<string, unknown>) => ({
    ...product,
    ...input,
    version: 3,
  }));
});

describe("product automation executors", () => {
  it("uses site-scoped reads and records before/after metadata snapshots", async () => {
    const result = await executeProductUpdate(
      action({ product_id: "product-1", updates: { name: "Updated" } }),
      { siteId: "site-1" },
    );
    expect(getProduct).toHaveBeenCalledWith("site-1", "product-1", expect.anything());
    expect(update).toHaveBeenCalledWith(
      "site-1",
      "product-1",
      { name: "Updated" },
      expect.anything(),
      2,
    );
    expect(result.beforeSnapshot).toMatchObject({ status: "draft" });
    expect(result.afterSnapshot).toMatchObject({ version: 3, name: "Updated" });
  });

  it("activates and archives through the same guarded executor path", async () => {
    expect(
      (await executeProductActivate(action({ product_id: "product-1" }), { siteId: "site-1" }))
        .afterSnapshot,
    ).toMatchObject({ status: "active" });
    expect(
      (await executeProductArchive(action({ product_id: "product-1" }), { siteId: "site-1" }))
        .afterSnapshot,
    ).toMatchObject({ status: "archived" });
  });

  it("rejects unapproved destinations and foreign publisher tags before mutation", async () => {
    await expect(
      executeProductAffiliateUrl(
        action({ product_id: "product-1", affiliate_url: "https://not-allowlisted.example/item" }),
        { siteId: "site-1" },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(update).not.toHaveBeenCalled();

    vi.stubEnv("AMAZON_ASSOCIATE_TAG", "ours-20");
    await expect(
      executeProductAffiliateUrl(
        action({ product_id: "product-1", affiliate_url: "https://amazon.com/item?tag=other-20" }),
        { siteId: "site-1" },
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(update).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("returns not found without touching another site's product", async () => {
    getProduct.mockResolvedValueOnce(null);
    await expect(
      executeProductUpdate(action({ product_id: "other-product", updates: { name: "x" } }), {
        siteId: "site-1",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(update).not.toHaveBeenCalled();
  });
});
