import { ArrowUpRight, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { watches } from "./lib/watches";
import { Reveal } from "./reveal";

export function ComparisonTable() {
  const sorted = [...watches].sort((a, b) => b.rating - a.rating);

  return (
    <section className="bg-secondary/20 py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Reveal className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl font-playfair">
            Head-to-head comparison
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            The same specs, side by side. Sort by rating to see which watch leads the pack for your
            budget.
          </p>
        </Reveal>

        <Reveal delay={100}>
          <div className="mt-12 overflow-hidden rounded-2xl border border-border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="border-b border-border bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-4 font-medium sm:px-6">Rank</th>
                    <th className="px-4 py-4 font-medium sm:px-6">Watch</th>
                    <th className="px-4 py-4 font-medium sm:px-6">Price</th>
                    <th className="px-4 py-4 font-medium sm:px-6">Rating</th>
                    <th className="px-4 py-4 font-medium sm:px-6">Movement</th>
                    <th className="px-4 py-4 font-medium sm:px-6">Best for</th>
                    <th className="px-4 py-4 font-medium sm:px-6" />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((watch, index) => (
                    <tr key={watch.id} className="border-b border-border last:border-b-0">
                      <td className="px-4 py-4 font-medium sm:px-6">#{index + 1}</td>
                      <td className="px-4 py-4 sm:px-6">
                        <span className="block font-semibold font-playfair">{watch.name}</span>
                        <span className="text-xs text-muted-foreground">{watch.brand}</span>
                      </td>
                      <td className="px-4 py-4 font-medium text-primary sm:px-6 font-playfair">
                        ${watch.price}
                      </td>
                      <td className="px-4 py-4 sm:px-6">
                        <div className="flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                          <span className="font-medium">{watch.rating}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground sm:px-6">{watch.movement}</td>
                      <td className="px-4 py-4 text-muted-foreground sm:px-6">{watch.bestFor}</td>
                      <td className="px-4 py-4 sm:px-6">
                        <Button size="sm" asChild>
                          <a
                            href={watch.affiliateUrl}
                            target="_blank"
                            rel="sponsored noopener noreferrer"
                          >
                            Check price
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </a>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
