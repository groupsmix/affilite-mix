"use client";

import Image from "next/image";
import type { DialHomepageConfig } from "@/lib/dial-config";
import { Reveal } from "./reveal";

interface PriceTiersProps {
  config: DialHomepageConfig;
}

export function PriceTiers({ config }: PriceTiersProps) {
  const { priceTiers, watches } = config;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      <Reveal>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Buying guides
        </p>
      </Reveal>

      <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
        {priceTiers.map((tier, i) => {
          const tierWatches = watches.filter((w) => w.tier === tier.id);
          const coverImage = tier.image ?? tierWatches.find((w) => w.image)?.image;
          const href = tier.href ?? `/${tier.guideSlug ?? `best-watches-${tier.id}`}`;

          return (
            <Reveal key={tier.id} delay={i * 90}>
              <a href={href} className="group block">
                <div className="relative aspect-[4/3] overflow-hidden bg-secondary/40">
                  {coverImage ? (
                    <Image
                      src={coverImage}
                      alt=""
                      fill
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : null}
                </div>

                <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {tier.label}
                </p>
                <h3 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-foreground">
                  {tier.title ?? `Best Watches ${tier.label}`}
                </h3>
                <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                  {tier.description ?? tier.tagline}
                </p>
                <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-[6px] transition-colors group-hover:text-primary">
                  See the Guide
                  <span
                    aria-hidden
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  >
                    &rarr;
                  </span>
                </span>
              </a>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
