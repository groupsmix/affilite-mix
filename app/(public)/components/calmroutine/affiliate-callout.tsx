"use client";

import { ArrowUpRight } from "lucide-react";
import { ProductCardCta } from "../product-card-client";
import { type CalmProduct } from "@/lib/calmroutine";

function affiliateUrl(productName: string, products: CalmProduct[]) {
  const found = products.find((p) => p.name.toLowerCase() === productName.toLowerCase());
  if (found) return found.destinationUrl;
  const query = encodeURIComponent(productName);
  return `https://www.amazon.com/s?k=${query}`;
}

function slugifyProductName(productName: string): string {
  return productName
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 128);
}

export function CalmAffiliateCallout({
  label,
  product,
  note,
  products,
}: {
  label: string;
  product: string;
  note: string;
  products: CalmProduct[];
}) {
  return (
    <aside className="my-8 rounded-xl border border-accent-mid/30 bg-accent-tint/60 p-6">
      <p className="text-xs font-medium tracking-wide text-accent-mid">{label}</p>
      <h4 className="mt-1 font-serif text-lg text-accent-dark">{product}</h4>
      <p className="mt-2 text-sm leading-relaxed text-text-secondary">{note}</p>
      <ProductCardCta
        href={affiliateUrl(product, products)}
        slug={slugifyProductName(product)}
        sourceType="calmroutine"
        placement="article-callout"
        productName={product}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-accent-dark px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-mid"
        label={
          <>
            Check current price
            <ArrowUpRight className="h-4 w-4" />
          </>
        }
      />
      <p className="mt-3 text-xs text-text-secondary">
        This is an affiliate link. If you buy through it, we may earn a small commission at no extra
        cost to you.
      </p>
    </aside>
  );
}
