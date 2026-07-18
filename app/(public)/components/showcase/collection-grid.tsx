"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { ProductRow, CategoryRow } from "@/types/database";
import { cn } from "@/lib/utils";
import { ScrollReveal } from "./showcase-ui";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";

interface ShowcaseProductCardProps {
  product: ProductRow;
  categoryName?: string;
}

function ShowcaseProductCard({ product, categoryName }: ShowcaseProductCardProps) {
  return (
    <article className="group bg-card border border-border overflow-hidden flex flex-col">
      <div className="relative aspect-square overflow-hidden">
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt={product.image_alt || product.name}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-xs uppercase tracking-[0.25em]">
            {categoryName ?? "Featured"}
          </div>
        )}
        {categoryName && (
          <span className="absolute top-4 left-4 text-[10px] uppercase tracking-[0.25em] bg-background/80 backdrop-blur-sm text-primary px-3 py-1.5">
            {categoryName}
          </span>
        )}
      </div>

      <div className="p-5 md:p-6 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-4">
          <h3 className="showcase-serif text-xl text-foreground text-balance">{product.name}</h3>
          {product.price && (
            <p className="text-primary font-medium whitespace-nowrap">{product.price}</p>
          )}
        </div>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed flex-1 line-clamp-3">
          {product.description}
        </p>

        {hasUsableAffiliateUrl(product.affiliate_url) && (
          <a
            href={product.affiliate_url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="mt-5 inline-flex items-center justify-center gap-2 border border-primary/50 text-primary text-xs uppercase tracking-[0.2em] px-4 py-3 hover:bg-primary hover:text-primary-foreground transition-colors duration-300"
          >
            {product.cta_text || `Shop on ${product.merchant || "retailer"}`}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
      </div>
    </article>
  );
}

interface CollectionGridProps {
  products: ProductRow[];
  categories: Pick<CategoryRow, "id" | "name">[];
  productLabelPlural: string;
}

export function CollectionGrid({ products, categories, productLabelPlural }: CollectionGridProps) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  // Only offer filters for categories that actually have a featured product
  const filterableCategories = useMemo(
    () =>
      categories.filter((c) =>
        products.some((p) => p.category_id === c.id || p.category_ids?.includes(c.id)),
      ),
    [categories, products],
  );

  const filtered =
    activeCategory === "all"
      ? products
      : products.filter(
          (p) => p.category_id === activeCategory || p.category_ids?.includes(activeCategory),
        );

  if (products.length === 0) return null;

  return (
    <section id="collection" className="w-full py-20 md:py-32">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <p className="text-xs uppercase tracking-[0.4em] text-primary text-center mb-4">
            The Edit
          </p>
          <h2 className="showcase-serif text-4xl md:text-5xl text-foreground text-center text-balance">
            Curated <span className="italic">Collection</span>
          </h2>
          <p className="mt-4 text-muted-foreground text-center max-w-lg mx-auto leading-relaxed text-pretty">
            Every one of these {productLabelPlural.toLowerCase()} earned its place. We link you to
            the best retailer — you get the best price, we earn a small commission.
          </p>
        </ScrollReveal>

        {filterableCategories.length > 1 && (
          <ScrollReveal delay={100}>
            <div
              className="mt-10 flex flex-wrap items-center justify-center gap-2"
              role="tablist"
              aria-label={`Filter ${productLabelPlural.toLowerCase()} by category`}
            >
              {[{ id: "all", name: "All" }, ...filterableCategories].map((cat) => (
                <button
                  key={cat.id}
                  role="tab"
                  aria-selected={activeCategory === cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={cn(
                    "text-xs uppercase tracking-[0.2em] px-4 py-2 border transition-colors duration-300",
                    activeCategory === cat.id
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-primary",
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </ScrollReveal>
        )}

        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((product, i) => (
            <ScrollReveal key={product.id} delay={(i % 3) * 100}>
              <ShowcaseProductCard
                product={product}
                categoryName={
                  categories.find(
                    (c) => c.id === product.category_id || product.category_ids?.includes(c.id),
                  )?.name
                }
              />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
