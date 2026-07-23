import Image from "next/image";
import { ShieldCheck, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DialHomepageConfig } from "@/lib/dial-config";

interface HeroProps {
  config: DialHomepageConfig;
}

export function Hero({ config }: HeroProps) {
  const { hero } = config;

  return (
    <section className="relative overflow-hidden bg-background pb-16 pt-32 md:pt-40">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-0 top-0 h-[60%] w-[60%] rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[40%] w-[40%] rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:items-center lg:px-8">
        <div>
          <div className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            {hero.badge}
          </div>

          <h1 className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl md:text-6xl font-playfair">
            {hero.title} <span className="text-primary">{hero.highlight}</span>.
          </h1>

          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {hero.subtitle}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Button size="lg" asChild>
              <a href={hero.ctaPrimary.href}>{hero.ctaPrimary.label}</a>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href={hero.ctaSecondary.href}>{hero.ctaSecondary.label}</a>
            </Button>
          </div>

          <div className="mt-8 flex items-center gap-1.5 text-sm">
            <div className="flex -space-x-1.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="h-4 w-4 fill-primary text-primary" />
              ))}
            </div>
            <span className="font-medium">{hero.trustRating}</span>
            <span className="text-muted-foreground">{hero.trustReviews}</span>
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-lg lg:max-w-none">
          <div className="absolute inset-0 animate-slow-spin rounded-full border border-dashed border-primary/20" />
          <Image
            src={hero.heroImage}
            alt={hero.heroImageAlt}
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
