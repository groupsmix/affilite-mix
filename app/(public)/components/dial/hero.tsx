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
    <section className="relative h-[60vh] min-h-[480px] overflow-hidden md:h-[70vh] md:min-h-[560px]">
      <Image
        src={hero.heroImage}
        alt={hero.heroImageAlt}
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-[#0B0F13]/95 via-[#0B0F13]/70 to-[#0B0F13]/20"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F13]/60 via-transparent to-[#0B0F13]/30" />

      <div className="relative z-10 flex h-full items-center px-4 pt-16 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-6xl">
          <div className="max-w-2xl animate-fade-up">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/90 backdrop-blur-sm">
              <ShieldCheck className="h-3.5 w-3.5 text-[#2A9D8F]" />
              {hero.badge}
            </div>

            <h1 className="text-balance font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-white md:text-6xl lg:text-7xl">
              {hero.title} <span className="text-[#2A9D8F]">{hero.highlight}</span>.
            </h1>

            <p className="mt-5 max-w-lg text-pretty text-lg leading-relaxed text-white/80">
              {hero.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                size="lg"
                className="bg-white font-medium text-[#0B0F13] hover:bg-white/90"
                asChild
              >
                <a href={hero.ctaPrimary.href}>{hero.ctaPrimary.label}</a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="border-white/30 bg-transparent font-medium text-white hover:bg-white/10 hover:text-white"
                asChild
              >
                <a href={hero.ctaSecondary.href}>{hero.ctaSecondary.label}</a>
              </Button>
            </div>

            <div className="mt-8 flex items-center gap-6 text-sm text-white/70">
              {hero.trustRating && (
                <div className="flex items-center gap-1.5">
                  <div className="flex">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-[#2A9D8F] text-[#2A9D8F]" />
                    ))}
                  </div>
                  <span>{hero.trustRating}</span>
                </div>
              )}
              {hero.trustRating && hero.trustReviews && (
                <div className="hidden h-4 w-px bg-white/30 sm:block" aria-hidden="true" />
              )}
              {hero.trustReviews && <span className="hidden sm:block">{hero.trustReviews}</span>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
