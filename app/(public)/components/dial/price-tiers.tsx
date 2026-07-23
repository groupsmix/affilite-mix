import type { DialHomepageConfig } from "@/lib/dial-config";
import { Reveal } from "./reveal";

interface PriceTiersProps {
  config: DialHomepageConfig;
}

export function PriceTiers({ config }: PriceTiersProps) {
  const { priceTiers, watches } = config;

  return (
    <section className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl font-playfair">
            Shop by budget
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Pick a price ceiling. We’ll show you the best mechanical, quartz, and smart picks that
            earned a spot on the wrist.
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {priceTiers.map((tier, i) => {
            const count = tier.count ?? watches.filter((w) => w.tier === tier.id).length;
            return (
              <Reveal key={tier.id} delay={i * 100}>
                <a
                  href={`#tier-${tier.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:bg-card/80"
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-xl font-semibold font-playfair">{tier.label}</h3>
                    <span className="text-sm text-muted-foreground">{count} picks</span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {tier.tagline}
                  </p>
                  <span className="mt-auto inline-flex items-center gap-1 pt-6 text-sm font-medium text-primary transition-transform group-hover:translate-x-1">
                    Browse {tier.label}
                  </span>
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
