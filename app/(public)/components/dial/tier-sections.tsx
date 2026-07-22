import Link from "next/link";
import { priceTiers, watches } from "./lib/watches";
import { ProductCard } from "./product-card";
import { Reveal } from "./reveal";

export function TierSections() {
  return (
    <section className="bg-background py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl font-playfair">
            Winners by budget
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Not everyone needs the same spend ceiling. Here are the standouts sorted by price tier.
          </p>
        </Reveal>

        <div className="mt-16 space-y-20">
          {priceTiers.map((tier) => {
            const tierWatches = watches.filter((w) => w.tier === tier.id);
            return (
              <div key={tier.id} id={`tier-${tier.id}`}>
                <Reveal>
                  <div className="mb-8 flex items-end justify-between gap-4 border-b border-border pb-4">
                    <div>
                      <h3 className="text-2xl font-semibold font-playfair">{tier.label}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>
                    </div>
                    <Link
                      href="/guide"
                      className="hidden text-sm font-medium text-primary sm:inline-block hover:underline"
                    >
                      All guides →
                    </Link>
                  </div>
                </Reveal>

                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {tierWatches.map((watch, i) => (
                    <Reveal key={watch.id} delay={i * 100} as="article">
                      <ProductCard watch={watch} />
                    </Reveal>
                  ))}
                </div>

                {tierWatches.length === 0 && (
                  <p className="text-sm text-muted-foreground">No picks in this tier yet.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
