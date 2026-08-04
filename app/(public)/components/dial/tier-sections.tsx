import type { DialHomepageConfig } from "@/lib/dial-config";
import { ProductCard } from "./product-card";
import { Reveal } from "./reveal";

interface TierSectionsProps {
  config: DialHomepageConfig;
}

export function TierSections({ config }: TierSectionsProps) {
  const { priceTiers, watches } = config;

  return (
    <div className="mx-auto max-w-6xl px-4 md:px-6">
      {priceTiers.map((tier) => {
        const tierWatches = watches
          .filter((w) => w.tier === tier.id)
          .sort((a, b) => b.rating - a.rating);

        if (tierWatches.length === 0) return null;

        return (
          <section
            key={tier.id}
            id={`tier-${tier.id}`}
            className="scroll-mt-24 border-t border-border py-16 md:py-20"
          >
            <Reveal className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-serif text-2xl font-semibold tracking-tight md:text-3xl">
                  Best Watches {tier.label}
                </h2>
                <p className="mt-2 text-muted-foreground">{tier.tagline}</p>
              </div>
              <span className="border border-border px-3 py-1 text-sm text-muted-foreground">
                {tierWatches.length} ranked
              </span>
            </Reveal>

            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {tierWatches.map((watch, i) => (
                <Reveal key={watch.id} delay={(i % 3) * 90} as="article">
                  <ProductCard watch={watch} />
                </Reveal>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
