"use client";

import Image from "next/image";
import { ArrowUpRight, Award, Star } from "lucide-react";
import type { Watch } from "@/lib/dial-config";
import { resolveDialAffiliateUrl } from "@/lib/dial-affiliate";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { ProductCardCta } from "../product-card-client";

interface ProductCardProps {
  watch: Watch;
}

export function ProductCard({ watch }: ProductCardProps) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/30">
      <div className="relative aspect-[4/3] overflow-hidden bg-secondary/40">
        {watch.editorsChoice && (
          <span className="absolute left-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">
            <Award className="h-3 w-3" />
            Editor’s Choice
          </span>
        )}
        <Image
          src={watch.image || "/placeholder.svg"}
          alt={watch.imageAlt ?? `${watch.brand} ${watch.name} watch`}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-contain p-6 transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {watch.brand} · {watch.category}
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-tight font-playfair">{watch.name}</h3>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-primary font-playfair">${watch.price}</div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-sm">
          <Star className="h-4 w-4 fill-primary text-primary" />
          <span className="font-medium">{watch.rating}</span>
          <span className="text-muted-foreground">({watch.reviewCount.toLocaleString()})</span>
        </div>

        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          {watch.editorNote}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 text-xs">
          <div>
            <dt className="text-muted-foreground">Movement</dt>
            <dd className="mt-0.5 font-medium">{watch.movement}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Water resist.</dt>
            <dd className="mt-0.5 font-medium">{watch.waterResistance}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Case</dt>
            <dd className="mt-0.5 font-medium">{watch.caseSize}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Best for</dt>
            <dd className="mt-0.5 font-medium">{watch.bestFor}</dd>
          </div>
        </dl>

        <div className="mt-5 flex-1" />

        {hasUsableAffiliateUrl(watch.affiliateUrl) ? (
          <>
            <ProductCardCta
              href={resolveDialAffiliateUrl(watch)}
              slug={watch.id}
              sourceType="dial"
              placement="product-card"
              productName={`${watch.brand} ${watch.name}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              label={
                <>
                  Check price
                  <ArrowUpRight className="h-4 w-4" />
                </>
              }
            />
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              We may earn a commission at no extra cost to you.
            </p>
          </>
        ) : null}
      </div>
    </article>
  );
}
