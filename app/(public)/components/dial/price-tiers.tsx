"use client";

import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { DialHomepageConfig } from "@/lib/dial-config";
import { Reveal } from "./reveal";

interface PriceTiersProps {
  config: DialHomepageConfig;
}

const tierMeta: Record<string, { eyebrow: string; from: string; via: string }> = {
  "under-200": {
    eyebrow: "Entry Level",
    from: "#182232",
    via: "rgba(24, 34, 50, 0.8)",
  },
  "under-300": {
    eyebrow: "Mid Tier",
    from: "#2A3846",
    via: "rgba(42, 56, 70, 0.8)",
  },
  "under-500": {
    eyebrow: "Premium Value",
    from: "#0B0F13",
    via: "rgba(11, 15, 19, 0.8)",
  },
};

export function PriceTiers({ config }: PriceTiersProps) {
  const { priceTiers, watches } = config;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      <Reveal className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">Shop by budget</p>
        <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-tight md:text-4xl">
          Pick your price, we&apos;ll handle the rest
        </h2>
        <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
          Every watch is ranked within its budget so you&apos;re always comparing like for like.
          Start with what you want to spend.
        </p>
      </Reveal>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {priceTiers.map((tier, i) => {
          const tierWatches = watches.filter((w) => w.tier === tier.id);
          const count = tier.count ?? tierWatches.length;
          const coverImage = tierWatches.find((w) => w.image)?.image;
          const meta = tierMeta[tier.id] ?? {
            eyebrow: "Collection",
            from: "#182232",
            via: "rgba(24, 34, 50, 0.8)",
          };
          const href = `/${tier.guideSlug ?? `best-watches-${tier.id}`}`;

          return (
            <Reveal key={tier.id} delay={i * 90}>
              <a
                href={href}
                className="group relative flex h-32 w-full overflow-hidden rounded-xl text-left md:h-48"
              >
                <div
                  className="absolute inset-0 z-10"
                  style={{
                    backgroundImage: `linear-gradient(to right, ${meta.from}, ${meta.via}, transparent)`,
                  }}
                />
                <div className="absolute inset-0 z-0 bg-muted">
                  {coverImage ? (
                    <Image
                      src={coverImage}
                      alt=""
                      fill
                      className="object-cover opacity-30 grayscale transition-transform duration-1000 group-hover:scale-110"
                      sizes="(max-width: 768px) 100vw, 33vw"
                    />
                  ) : null}
                </div>
                <div className="relative z-20 flex h-full flex-col justify-center px-8">
                  <span className="text-[10px] font-medium uppercase tracking-widest text-white/60">
                    {meta.eyebrow}
                  </span>
                  <span className="font-serif text-2xl font-semibold text-white md:text-3xl">
                    {tier.label}
                  </span>
                  <span className="mt-1 text-xs text-white/70">{count} picks</span>
                </div>
                <ArrowRight className="absolute bottom-4 right-4 z-20 h-5 w-5 text-white/70 transition-transform duration-300 group-hover:translate-x-1" />
              </a>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
