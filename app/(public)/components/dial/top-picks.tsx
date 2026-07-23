import type { DialHomepageConfig } from "@/lib/dial-config";
import { ProductCard } from "./product-card";
import { Reveal } from "./reveal";

interface TopPicksProps {
  config: DialHomepageConfig;
}

export function TopPicks({ config }: TopPicksProps) {
  const { topPicks, watches } = config;

  return (
    <section id="top-picks" className="bg-secondary/20 py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl font-playfair">
            {topPicks.title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{topPicks.subtitle}</p>
        </Reveal>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {watches.map((watch, i) => (
            <Reveal key={watch.id} delay={i * 75} as="article">
              <ProductCard watch={watch} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
