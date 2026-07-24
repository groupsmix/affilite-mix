import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { CalmProduct } from "@/lib/calmroutine";

export function CalmProductCard({ product }: { product: CalmProduct }) {
  const readFirst = Boolean(product.relatedPostSlug);
  const href = readFirst ? `/${product.relatedPostSlug}` : product.destinationUrl;

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-border-subtle bg-card">
      <div className="aspect-[4/3] overflow-hidden bg-accent-tint/40">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.imageUrl || "/placeholder.svg"}
          alt={product.name}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-lg leading-snug text-text-primary text-balance">
            {product.name}
          </h3>
          <span
            className="shrink-0 rounded-md bg-accent-tint px-2 py-0.5 text-xs font-medium text-accent-dark"
            aria-label={`Price tier ${product.priceTier}`}
          >
            {product.priceTier}
          </span>
        </div>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-text-secondary">
          {product.oneLineNote}
        </p>

        {readFirst ? (
          <Link
            href={href}
            className="mt-4 inline-flex items-center gap-1.5 self-start rounded-lg border border-accent-mid/40 px-4 py-2 text-sm font-medium text-accent-dark transition-colors hover:bg-accent-tint"
          >
            Read the review first
            <ArrowRight className="h-4 w-4" />
          </Link>
        ) : (
          <a
            href={href}
            className="mt-4 inline-flex items-center gap-1.5 self-start rounded-lg bg-accent-dark px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-accent-mid"
          >
            Check current price
            <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
      </div>
    </article>
  );
}
