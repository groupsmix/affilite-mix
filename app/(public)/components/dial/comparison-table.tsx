import { ArrowUpRight, Star } from "lucide-react";
import Link from "next/link";
import type { DialHomepageConfig } from "@/lib/dial-config";
import { resolveDialAffiliateUrl } from "@/lib/dial-affiliate";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { ProductCardCta } from "../product-card-client";
import { Reveal } from "./reveal";

interface ComparisonTableProps {
  config: DialHomepageConfig;
}

export function ComparisonTable({ config }: ComparisonTableProps) {
  const { comparisonTable, watches } = config;
  const ranked = [...watches].sort((a, b) => b.rating - a.rating);

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      <Reveal className="max-w-2xl">
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Side by side</p>
        <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-tight md:text-4xl">
          {comparisonTable.title}
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          {comparisonTable.subtitle}
        </p>
      </Reveal>

      <Reveal className="mt-10 overflow-hidden rounded-xl border border-border">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-4 font-medium">Watch</th>
                <th className="px-5 py-4 font-medium">Price</th>
                <th className="px-5 py-4 font-medium">Rating</th>
                <th className="px-5 py-4 font-medium">Movement</th>
                <th className="px-5 py-4 font-medium">Best for</th>
                <th className="px-5 py-4 font-medium sr-only">Link</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((w) => (
                <tr
                  key={w.id}
                  className="border-t border-border transition-colors hover:bg-secondary/30"
                >
                  <td className="px-5 py-4">
                    <div className="font-medium text-foreground">{w.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {w.brand} · {w.category}
                    </div>
                  </td>
                  <td className="px-5 py-4 font-serif font-semibold text-primary">${w.price}</td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1">
                      <Star className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden="true" />
                      {w.rating}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{w.movement}</td>
                  <td className="px-5 py-4 text-muted-foreground">{w.bestFor}</td>
                  <td className="px-5 py-4">
                    {hasUsableAffiliateUrl(w.affiliateUrl) ? (
                      <ProductCardCta
                        href={resolveDialAffiliateUrl(w)}
                        slug={w.id}
                        sourceType="dial"
                        placement="comparison-table"
                        productName={`${w.brand} ${w.name}`}
                        className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                        label={
                          <>
                            {comparisonTable.ctaLabel}
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </>
                        }
                      />
                    ) : (
                      <Link
                        href={`/search?q=${encodeURIComponent(`${w.brand} ${w.name}`)}`}
                        className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                      >
                        Find deals
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Reveal>
    </section>
  );
}
