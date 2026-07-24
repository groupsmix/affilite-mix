import type { DialHomepageConfig } from "@/lib/dial-config";
import { ProductCard } from "./product-card";
import { Reveal } from "./reveal";

interface TopPicksProps {
  config: DialHomepageConfig;
}

export function TopPicks({ config }: TopPicksProps) {
  const { topPicks, watches } = config;

  return (
    <section id="top-picks" className="border-t border-border bg-secondary/20">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
        <Reveal className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-widest text-primary">
            The short list
          </p>
          <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-tight md:text-4xl">
            {topPicks.title}
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            {topPicks.subtitle}
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {watches.map((watch, i) => (
            <Reveal key={watch.id} delay={(i % 3) * 90} as="article">
              <ProductCard watch={watch} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
