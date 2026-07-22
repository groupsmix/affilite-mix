import { watches } from "./lib/watches";
import { ProductCard } from "./product-card";
import { Reveal } from "./reveal";

export function TopPicks() {
  return (
    <section id="top-picks" className="bg-secondary/20 py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl font-playfair">
            Top rated this month
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            These are the watches we keep reaching for. Every pick below was worn for at least two
            weeks before scoring.
          </p>
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
