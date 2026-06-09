"use client";

import { useEffect, useState } from "react";
import { fetchTopProducts, type TopProductRow } from "@/lib/analytics/api";

function formatUSD(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function TopProductsTable() {
  const [data, setData] = useState<TopProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTopProducts(30, 20)
      .then((res) => setData(res.products))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">No product data available.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="pb-2 pe-4">#</th>
            <th className="pb-2 pe-4">Product</th>
            <th className="pb-2 pe-4 text-right">Clicks</th>
            <th className="pb-2 text-right">Est. Revenue</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.map((product, i) => (
            <tr key={product.product_name} className="hover:bg-muted/50">
              <td className="py-2.5 pe-4 tabular-nums text-muted-foreground">{i + 1}</td>
              <td className="py-2.5 pe-4 font-medium">{product.product_name}</td>
              <td className="py-2.5 pe-4 text-right tabular-nums">
                {product.click_count.toLocaleString()}
              </td>
              <td className="py-2.5 text-right tabular-nums">
                {formatUSD(product.estimatedRevenue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
