import { ArrowRight } from "lucide-react";
import type { DialHomepageConfig } from "@/lib/dial-config";
import { Reveal } from "./reveal";

interface PriceTiersProps {
  config: DialHomepageConfig;
}

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

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {priceTiers.map((tier, i) => {
          const count = tier.count ?? watches.filter((w) => w.tier === tier.id).length;
          return (
            <Reveal key={tier.id} delay={i * 90}>
              <a
                href={`#tier-${tier.id}`}
                className="group flex h-full flex-col justify-between rounded-xl border border-border bg-card p-7 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-black/30"
              >
                <div>
                  <div className="flex items-baseline justify-between">
                    <span className="font-serif text-3xl font-semibold">{tier.label}</span>
                    <span className="text-sm text-muted-foreground">{count} picks</span>
                  </div>
                  <p className="mt-3 text-muted-foreground">{tier.tagline}</p>
                </div>
                <span className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary">
                  View rankings
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                </span>
              </a>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
