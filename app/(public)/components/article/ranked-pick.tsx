"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Check, Minus, Star } from "lucide-react";
import type { Watch } from "@/lib/dial-config";
import { resolveDialAffiliateUrl } from "@/lib/dial-affiliate";
import { hasUsableAffiliateUrl } from "@/lib/affiliate-url";
import { ProductCardCta } from "../product-card-client";
import { Reveal } from "./reveal";

type RankedPickProps = {
  rank: number;
  award: string;
  reason: string;
  watch: Watch;
};

export function RankedPick({ rank, award, reason, watch }: RankedPickProps) {
  return (
    <Reveal
      as="article"
      id={watch.id}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/30 px-5 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-serif text-sm font-bold text-primary-foreground">
            {rank}
          </span>
          <span className="text-sm font-semibold uppercase tracking-wide text-primary">
            {award}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Star className="h-4 w-4 fill-primary text-primary" aria-hidden="true" />
          <span className="font-medium">{watch.rating}</span>
          <span className="text-muted-foreground" aria-hidden="true">
            &middot;
          </span>
          <span className="text-muted-foreground">
            {watch.reviewCount.toLocaleString()} reviews
          </span>
        </div>
      </div>

      <div className="grid gap-6 p-5 md:grid-cols-[280px_1fr] md:p-6">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-secondary/50 ring-1 ring-inset ring-border/40">
          <Image
            src={watch.image || "/placeholder.svg"}
            alt={`${watch.brand} ${watch.name} watch`}
            fill
            sizes="(max-width: 768px) 100vw, 280px"
            className="object-contain p-6"
          />
        </div>

        <div className="flex flex-col">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            {watch.brand} · {watch.category}
          </p>
          <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-2xl font-semibold leading-tight">{watch.name}</h3>
            <span className="font-serif text-xl font-semibold text-primary">
              Around ${watch.price}
            </span>
          </div>

          <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Why we picked it: </span>
            {reason}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Pros</p>
              <ul className="mt-2 space-y-1.5">
                {watch.pros.map((p) => (
                  <li key={p} className="flex gap-2 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-foreground">Cons</p>
              <ul className="mt-2 space-y-1.5">
                {watch.cons.map((c) => (
                  <li key={c} className="flex gap-2 text-sm text-muted-foreground">
                    <Minus
                      className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-5 flex-1" />

          {hasUsableAffiliateUrl(watch.affiliateUrl) ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ProductCardCta
                href={resolveDialAffiliateUrl(watch)}
                slug={watch.id}
                sourceType="guide"
                placement="ranked-pick"
                productName={`${watch.brand} ${watch.name}`}
                className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                label={
                  <>
                    Check price
                    <ArrowUpRight className="h-4 w-4" />
                  </>
                }
              />
              <p className="text-[11px] text-muted-foreground">
                We may earn a commission at no extra cost to you.
              </p>
            </div>
          ) : (
            <Link
              href={`/search?q=${encodeURIComponent(`${watch.brand} ${watch.name}`)}`}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-foreground/30 bg-secondary/50 px-4 py-2 text-center text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              Find deals
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>
    </Reveal>
  );
}
