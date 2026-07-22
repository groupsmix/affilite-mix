import Image from "next/image";
import { ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-background pb-16 pt-32 md:pt-40">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute right-0 top-0 h-[60%] w-[60%] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[40%] w-[40%] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8 lg:items-center">
        <div>
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Independent reviews · Reader-supported
          </div>

          <h1 className="mt-6 text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl md:text-6xl font-playfair">
            The best watches under $500, <span className="text-primary">actually tested</span>.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            We wear, time, and photograph every pick. No sponsored rankings, no manufacturer quotes
            — just honest buying guides for every budget.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button size="lg" asChild>
              <a href="#top-picks">See top picks</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how-we-test">How we test watches</a>
            </Button>
          </div>

          <div className="mt-8 flex items-center gap-1.5 text-sm">
            <div className="flex -space-x-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-primary text-primary" />
              ))}
            </div>
            <span className="font-medium">4.8/5</span>
            <span className="text-muted-foreground">from 12,000+ readers</span>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-lg lg:max-w-none">
          <div className="absolute inset-0 animate-slow-spin rounded-full border border-dashed border-primary/20" />
          <Image
            src="/watches/hero-watch.png"
            alt="Featured automatic watch on a dark editorial background"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-contain p-6"
          />
        </div>
      </div>
    </section>
  );
}
