"use client";

import type { ProductRow } from "@/types/database";

interface ProductLink {
  product_id: string;
  position: number;
  role: string;
  custom_aff_url: string | null;
}

interface ProductLinkerProps {
  products: ProductRow[];
  links: ProductLink[];
  onChange: (links: ProductLink[]) => void;
}

const ROLES = ["hero", "featured", "related", "vs-left", "vs-right"] as const;

export function ProductLinker({ products, links, onChange }: ProductLinkerProps) {
  const linkedIds = new Set(links.map((l) => l.product_id));
  const availableProducts = products.filter((p) => !linkedIds.has(p.id));

  function addProduct(productId: string) {
    onChange([
      ...links,
      {
        product_id: productId,
        position: links.length,
        role: "related",
        custom_aff_url: null,
      },
    ]);
  }

  function removeProduct(productId: string) {
    onChange(links.filter((l) => l.product_id !== productId));
  }

  function updateLink(productId: string, field: keyof ProductLink, value: string | number | null) {
    onChange(
      links.map((l) =>
        l.product_id === productId ? { ...l, [field]: value } : l
      )
    );
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const updated = [...links];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated.map((l, i) => ({ ...l, position: i })));
  }

  function moveDown(index: number) {
    if (index >= links.length - 1) return;
    const updated = [...links];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated.map((l, i) => ({ ...l, position: i })));
  }

  function getProductName(id: string): string {
    return products.find((p) => p.id === id)?.name ?? "Unknown";
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">Linked Products</h3>

      {links.length === 0 ? (
        <p className="mb-3 text-sm text-gray-500">No products linked yet.</p>
      ) : (
        <div className="mb-3 space-y-2">
          {links.map((link, idx) => (
            <div
              key={link.product_id}
              className="flex items-center gap-2 rounded border border-gray-100 bg-gray-50 p-2"
            >
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => moveUp(idx)}
                  disabled={idx === 0}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(idx)}
                  disabled={idx === links.length - 1}
                  className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  ▼
                </button>
              </div>

              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                {getProductName(link.product_id)}
              </span>

              <select
                value={link.role}
                onChange={(e) => updateLink(link.product_id, "role", e.target.value)}
                className="rounded border border-gray-200 px-2 py-1 text-xs"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => removeProduct(link.product_id)}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      {availableProducts.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            id="add-product-select"
            defaultValue=""
            className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="" disabled>Select a product to add...</option>
            {availableProducts.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              const select = document.getElementById("add-product-select") as HTMLSelectElement;
              if (select.value) {
                addProduct(select.value);
                select.value = "";
              }
            }}
            className="rounded bg-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-300"
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
