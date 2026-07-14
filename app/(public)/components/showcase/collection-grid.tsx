"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { ProductRow, CategoryRow } from "@/types/database";
import { cn } from "@/lib/utils";
import { fireTrackingBeacon } from "../product-card";
import { useCookieConsent } from "../cookie-consent";
import { GiftWorthinessScore } from "../gift-worthiness-score";
import { ScrollReveal } from "./showcase-ui";

interface ShowcaseProductCardProps {
  product: ProductRow;
  categoryName?: string;
}

function ShowcaseProductCard({ product, categoryName }: ShowcaseProductCardProps) {
  const { accepted: consentAccepted } = useCookieConsent();
  const [imgError, setImgError] = useState(false);

  const ctaText = product.cta_text || `Shop on ${product.merchant || "retailer"}`;

  function handleCtaClick() {
    if (product.affiliate_url && consentAccepted) {
      fireTrackingBeacon(product.slug, "showcase");
    }
  }

  return (
    <article className="group flex flex-col overflow-hidden border border-border bg-card">
      <div className="relative aspect-square overflow-hidden">
        {product.image_url && !imgError ? (
          <Image
            src={product.image_url}
            alt={product.image_alt || product.name}
            fill
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs uppercase tracking-[0.25em] text-muted-foreground">
            {categoryName ?? "Featured"}
          </div>
        )}
        {categoryName && (
          <span className="absolute left-4 top-4 bg-background/80 px-3 py-1.5 text-[10px] uppercase tracking-[0.25em] text-accent backdrop-blur-sm">
            {categoryName}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <h3 className="font-heading text-xl text-balance text-card-foreground">{product.name}</h3>
          <div className="flex shrink-0 items-center gap-2">
            {product.price && (
              <p className="whitespace-nowrap font-medium text-accent">{product.price}</p>
            )}
            {product.score !== null && (
              <GiftWorthinessScore score={product.score} size="sm" showLabel={false} />
            )}
          </div>
        </div>
        <p className="mt-2 flex-1 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
          {product.description}
        </p>

        {product.affiliate_url ? (
          <a
            href={product.affiliate_url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            onClick={handleCtaClick}
            className="mt-5 inline-flex items-center justify-center gap-2 border border-accent/50 px-4 py-3 text-xs uppercase tracking-[0.2em] text-accent transition-colors duration-300 hover:bg-[var(--color-accent-text)] hover:text-[var(--color-accent-text-foreground)]"
          >
            {ctaText}
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        ) : (
          <span className="mt-5 inline-flex items-center justify-center border border-border px-4 py-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
            {ctaText}
          </span>
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
    () => categories.filter((c) => products.some((p) => p.category_id === c.id)),
    [categories, products],
  );

  const filtered =
    activeCategory === "all" ? products : products.filter((p) => p.category_id === activeCategory);

  if (products.length === 0) return null;

  return (
    <section id="collection" className="w-full py-20 md:py-32">
      <div className="container mx-auto px-4">
        <ScrollReveal>
          <p className="mb-4 text-center text-xs uppercase tracking-[0.4em] text-accent">
            The Edit
          </p>
          <h2 className="text-center text-balance font-heading text-4xl italic text-foreground md:text-5xl">
            Curated <span className="italic">Collection</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-center text-pretty leading-relaxed text-muted-foreground">
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
                    "border px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors duration-300",
                    activeCategory === cat.id
                      ? "border-accent bg-[var(--color-accent-text)] text-[var(--color-accent-text-foreground)]"
                      : "border-border text-muted-foreground hover:border-accent/50 hover:text-accent",
                  )}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </ScrollReveal>
        )}

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product, i) => (
            <ScrollReveal key={product.id} delay={(i % 3) * 100}>
              <ShowcaseProductCard
                product={product}
                categoryName={categories.find((c) => c.id === product.category_id)?.name}
              />
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
