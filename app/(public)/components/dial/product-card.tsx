"use client";

import Image from "next/image";
import Link from "next/link";
import { Award, Star } from "lucide-react";
import type { Watch } from "@/lib/dial-config";
import { resolveDialAffiliateUrl } from "@/lib/dial-affiliate";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { ProductCardCta } from "../product-card-client";

interface ProductCardProps {
  watch: Watch;
}

export function ProductCard({ watch }: ProductCardProps) {
  return (
    <article className="group flex h-full flex-col">
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary/40">
        {watch.editorsChoice && (
          <span className="absolute left-0 top-0 z-10 inline-flex items-center gap-1.5 bg-primary px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-primary-foreground">
            <Award className="h-3 w-3" />
            Editor&rsquo;s Choice
          </span>
        )}
        <Image
          src={watch.image || "/placeholder.svg"}
          alt={watch.imageAlt ?? `${watch.brand} ${watch.name} watch`}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-contain transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col pt-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {watch.brand} &middot; {watch.category}
        </p>
        <h3 className="mt-2 font-serif text-xl font-semibold leading-tight tracking-tight">
          {watch.name}
        </h3>

        <div className="mt-2 flex items-center gap-1.5 text-sm">
          <Star className="h-3.5 w-3.5 fill-foreground text-foreground" />
          <span className="font-medium">{watch.rating}</span>
          <span className="text-muted-foreground">({watch.reviewCount.toLocaleString()})</span>
        </div>

        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          {watch.editorNote}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-xs">
          <div>
            <dt className="uppercase tracking-[0.12em] text-muted-foreground">Movement</dt>
            <dd className="mt-1 font-medium">{watch.movement}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.12em] text-muted-foreground">Water resist.</dt>
            <dd className="mt-1 font-medium">{watch.waterResistance}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.12em] text-muted-foreground">Case</dt>
            <dd className="mt-1 font-medium">{watch.caseSize}</dd>
          </div>
          <div>
            <dt className="uppercase tracking-[0.12em] text-muted-foreground">Best for</dt>
            <dd className="mt-1 font-medium">{watch.bestFor}</dd>
          </div>
        </dl>

        <div className="mt-5 flex-1" />

        <div className="flex items-end justify-between gap-3 border-t border-border pt-4">
          {hasUsableAffiliateUrl(watch.affiliateUrl) ? (
            <ProductCardCta
              href={resolveDialAffiliateUrl(watch)}
              slug={watch.id}
              sourceType="dial"
              placement="product-card"
              productName={`${watch.brand} ${watch.name}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-[6px] transition-colors hover:text-primary"
              label={
                <>
                  Check price
                  <span aria-hidden>&rarr;</span>
                </>
              }
            />
          ) : (
            <Link
              href={`/search?q=${encodeURIComponent(`${watch.brand} ${watch.name}`)}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-[6px] transition-colors hover:text-primary"
            >
              Find deals
              <span aria-hidden>&rarr;</span>
            </Link>
          )}
          <span className="font-serif text-lg font-semibold text-foreground">
            From ${watch.price}
          </span>
        </div>
        {hasUsableAffiliateUrl(watch.affiliateUrl) && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            We may earn a commission at no extra cost to you.
          </p>
        )}
      </div>
    </article>
  );
}
