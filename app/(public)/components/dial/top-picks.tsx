import type { DialHomepageConfig } from "@/lib/dial-config";
import { ProductCard } from "./product-card";
import { Reveal } from "./reveal";

interface TopPicksProps {
  config: DialHomepageConfig;
}

export function TopPicks({ config }: TopPicksProps) {
  const { topPicks, watches } = config;

  return (
    <section id="top-picks" className="border-t border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
        <Reveal className="max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Best Budget Picks
          </p>
          <h2 className="mt-3 text-balance font-serif text-3xl font-semibold tracking-tight md:text-4xl">
            {topPicks.title}
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            {topPicks.subtitle}
          </p>
        </Reveal>

        <div className="mt-12 flex gap-6 overflow-x-auto pb-4 md:grid md:grid-cols-3 md:overflow-visible">
          {watches.map((watch, i) => (
            <Reveal
              key={watch.id}
              delay={(i % 3) * 90}
              as="article"
              className="min-w-[300px] md:min-w-0"
            >
              <ProductCard watch={watch} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
