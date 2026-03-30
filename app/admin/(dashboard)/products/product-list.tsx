"use client";

import { useState } from "react";
import Link from "next/link";
import { BulkActions } from "./bulk-actions";
import { ProductDeleteButton } from "./product-delete-button";

interface ProductListItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  score: number | null;
  featured: boolean;
}

interface ProductListProps {
  products: ProductListItem[];
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    draft: "bg-yellow-100 text-yellow-700",
    archived: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

export function ProductList({ products }: ProductListProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleAll() {
    if (selectedIds.length === products.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  }

  return (
    <>
      <BulkActions selectedIds={selectedIds} onClear={() => setSelectedIds([])} />

      {/* Card layout on mobile */}
      <div className="mt-4 grid gap-3 md:hidden">
        {products.map((p) => (
          <div key={p.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  className="rounded border-gray-300"
                />
                <h3 className="font-medium text-gray-900">{p.name}</h3>
              </div>
              <StatusBadge status={p.status} />
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="truncate text-xs text-gray-400">{p.slug}</span>
              {p.score !== null && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                  {p.score}/10
                </span>
              )}
              {p.featured && (
                <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                  Featured
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <Link
                href={`/admin/products/${p.id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                Edit
              </Link>
              <ProductDeleteButton id={p.id} name={p.name} />
            </div>
          </div>
        ))}
      </div>

      {/* Table layout on md+ screens */}
      <div className="mt-4 hidden overflow-hidden rounded-lg border border-gray-200 bg-white md:block">
        <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.length === products.length && products.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 font-medium text-gray-700">Name</th>
              <th className="px-4 py-3 font-medium text-gray-700">Slug</th>
              <th className="px-4 py-3 font-medium text-gray-700">Status</th>
              <th className="px-4 py-3 font-medium text-gray-700">Score</th>
              <th className="px-4 py-3 font-medium text-gray-700">Featured</th>
              <th className="px-4 py-3 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggleSelect(p.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                <td className="px-4 py-3 text-gray-500">{p.slug}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-gray-500">{p.score ?? "—"}</td>
                <td className="px-4 py-3 text-gray-500">{p.featured ? "Yes" : "No"}</td>
                <td className="flex gap-2 px-4 py-3">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="text-sm text-blue-600 hover:underline"
                  >
                    Edit
                  </Link>
                  <ProductDeleteButton id={p.id} name={p.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </>
  );
}
