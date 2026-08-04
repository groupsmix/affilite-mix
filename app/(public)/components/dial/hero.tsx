import Image from "next/image";
import { Star } from "lucide-react";
import type { DialHomepageConfig } from "@/lib/dial-config";

interface HeroProps {
  config: DialHomepageConfig;
}

export function Hero({ config }: HeroProps) {
  const { hero } = config;

  return (
    <section className="border-b border-border">
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-28 md:grid-cols-2 md:gap-14 md:px-6 md:pb-24 md:pt-36">
        <div className="animate-fade-up">
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            {hero.badge}
          </p>

          <h1 className="mt-5 text-balance font-serif text-5xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-6xl">
            {hero.title}
            <br />
            <span className="italic">{hero.highlight}.</span>
          </h1>

          <p className="mt-6 max-w-md text-pretty leading-relaxed text-muted-foreground">
            {hero.subtitle}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
            <a
              href={hero.ctaPrimary.href}
              className="group inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-[6px] transition-colors hover:text-primary"
            >
              {hero.ctaPrimary.label}
              <span
                aria-hidden
                className="transition-transform duration-300 group-hover:translate-x-0.5"
              >
                &rarr;
              </span>
            </a>
            {hero.ctaSecondary.label && (
              <a
                href={hero.ctaSecondary.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {hero.ctaSecondary.label}
              </a>
            )}
          </div>

          {(hero.trustRating || hero.trustReviews) && (
            <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
              {hero.trustRating && (
                <div className="flex items-center gap-1.5">
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <span>{hero.trustRating}</span>
                </div>
              )}
              {hero.trustRating && hero.trustReviews && (
                <div className="hidden h-4 w-px bg-border sm:block" aria-hidden="true" />
              )}
              {hero.trustReviews && <span className="hidden sm:block">{hero.trustReviews}</span>}
            </div>
          )}
        </div>

        <div className="relative aspect-[4/3] overflow-hidden">
          <Image
            src={hero.heroImage}
            alt={hero.heroImageAlt}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
