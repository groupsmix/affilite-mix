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
    <section className="relative overflow-hidden pt-16">
      {/* subtle radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-24 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 md:grid-cols-2 md:gap-8 md:px-6 md:pb-24 md:pt-20">
        <div className="animate-fade-up">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-secondary/60 px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            {hero.badge}
          </div>

          <h1 className="text-balance font-serif text-4xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            {hero.title} <span className="text-primary">{hero.highlight}</span>.
          </h1>

          <p className="mt-5 max-w-md text-pretty leading-relaxed text-muted-foreground">
            {hero.subtitle}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button size="lg" className="font-medium" asChild>
              <a href={hero.ctaPrimary.href}>{hero.ctaPrimary.label}</a>
            </Button>
            <Button size="lg" variant="outline" className="font-medium" asChild>
              <a href={hero.ctaSecondary.href}>{hero.ctaSecondary.label}</a>
            </Button>
          </div>

          <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <div className="flex">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                ))}
              </div>
              <span>{hero.trustRating}</span>
            </div>
            <div className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
            <span className="hidden sm:block">{hero.trustReviews}</span>
          </div>
        </div>

        <div className="relative animate-fade-up [animation-delay:120ms]">
          <div className="relative mx-auto aspect-square max-w-md">
            {/* slow-rotating ring accent */}
            <div
              aria-hidden
              className="animate-slow-spin absolute inset-6 rounded-full border border-dashed border-primary/25"
            />
            <div
              aria-hidden
              className="absolute inset-0 rounded-full bg-gradient-to-b from-secondary/40 to-transparent"
            />
            <Image
              src={hero.heroImage}
              alt={hero.heroImageAlt}
              fill
              priority
              sizes="(max-width: 768px) 90vw, 420px"
              className="object-contain drop-shadow-2xl"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
