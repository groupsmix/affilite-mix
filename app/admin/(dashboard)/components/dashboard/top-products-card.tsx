// Card composition patterns adapted from https://github.com/Qualiora/shadboard (MIT).
import Image from "next/image";
import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getTopProducts } from "@/lib/dal/affiliate-clicks";
import { listProductsByNames } from "@/lib/dal/products";

interface TopProductsCardProps {
  siteId: string;
  sevenDaysAgo: string;
  limit?: number;
}

export async function TopProductsCard({ siteId, sevenDaysAgo, limit = 5 }: TopProductsCardProps) {
  const topProducts = await getTopProducts(siteId, sevenDaysAgo, limit);

  const byName = new Map<string, { id: string; image_url: string; image_alt: string }>();
  if (topProducts.length > 0) {
    const rows = await listProductsByNames(
      siteId,
      topProducts.map((p) => p.product_name),
    );
    for (const row of rows) {
      byName.set(row.name, {
        id: row.id,
        image_url: row.image_url ?? "",
        image_alt: row.image_alt ?? row.name,
      });
    }
  }

  return (
    <Card className="gap-4" data-slot="top-products-card">
      <CardHeader>
        <div className="flex flex-col gap-1">
          <CardTitle className="text-base">Top products (7d)</CardTitle>
          <CardDescription>Most-clicked affiliate products for this niche.</CardDescription>
        </div>
        <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
          <Link
            href="/admin/products"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline"
          >
            All products
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        {topProducts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No click data yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {topProducts.map((p) => {
              const match = byName.get(p.product_name);
              const href = match ? `/admin/products/${match.id}` : "/admin/products";
              const image = match?.image_url;

              return (
                <li
                  key={p.product_name}
                  className="flex items-center gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                    {image ? (
                      <Image
                        src={image}
                        alt={match?.image_alt ?? p.product_name}
                        fill
                        sizes="40px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground"
                      >
                        {p.product_name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={href}
                      className="truncate text-sm font-medium text-foreground hover:underline"
                    >
                      {p.product_name}
                    </Link>
                  </div>
                  <span className="text-sm font-semibold text-foreground tabular-nums">
                    {p.click_count.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">clicks</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
