import Image from "next/image";
import type { DialHomepageConfig } from "@/lib/dial-config";

interface HeroProps {
  config: DialHomepageConfig;
}

/**
 * WristNerd hero — dark, premium, editorial buying-guide positioning.
 *
 * Deliberately self-dark: the dial homepage is light-themed, but the hero is a
 * charcoal band (matching the dark header) per the 2026-08 redesign brief.
 * Copy must stay honest to the affiliate model: no "we test", no "hands-on",
 * no lab claims — curated guides and recommendations only.
 */
export function Hero({ config }: HeroProps) {
  const { hero } = config;

  return (
    <section
      className="relative overflow-hidden border-b border-border"
      style={{
        background:
          "radial-gradient(900px 600px at 82% 30%, rgba(42,157,143,0.12), transparent 60%)," +
          "radial-gradient(700px 500px at 8% 90%, rgba(42,157,143,0.05), transparent 55%)," +
          "linear-gradient(180deg, #101214 0%, #0b0f13 100%)",
      }}
    >
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:gap-18 md:px-6 md:py-28">
        <div className="animate-fade-up max-w-xl">
          <p className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#2A9D8F]">
            <span aria-hidden className="inline-block h-px w-7 bg-[#2A9D8F]/60" />
            {hero.badge}
          </p>

          <h1 className="mt-7 text-balance font-serif text-4xl font-medium leading-[1.08] tracking-tight text-[#f2f1ee] sm:text-5xl md:text-6xl">
            {hero.title} <span className="italic">{hero.highlight}.</span>
          </h1>

          <p className="mt-6 max-w-[44ch] text-pretty text-base leading-relaxed text-white/60 md:text-lg">
            {hero.subtitle}
          </p>

          <div className="mt-10 flex flex-col gap-3.5 sm:flex-row sm:flex-wrap">
            <a
              href={hero.ctaPrimary.href}
              className="inline-flex h-[52px] items-center justify-center rounded-lg bg-[#f2f1ee] px-7 text-[15px] font-semibold text-[#0b0f13] transition-colors hover:bg-[#2A9D8F] hover:text-white"
            >
              {hero.ctaPrimary.label}
            </a>
            {hero.ctaSecondary.label && (
              <a
                href={hero.ctaSecondary.href}
                className="inline-flex h-[52px] items-center justify-center rounded-lg border border-white/15 px-7 text-[15px] font-semibold text-[#f2f1ee] transition-colors hover:border-white/40"
              >
                {hero.ctaSecondary.label}
              </a>
            )}
          </div>

          {hero.trustLine && <p className="mt-7 text-[13px] text-white/40">{hero.trustLine}</p>}
        </div>

        <div className="relative mx-auto w-full max-w-md md:max-w-none">
          <Image
            src={hero.heroImage}
            alt={hero.heroImageAlt}
            width={1376}
            height={768}
            priority
            sizes="(max-width: 768px) 100vw, 45vw"
            className="h-auto w-full [filter:drop-shadow(0_40px_60px_rgba(0,0,0,0.55))]"
          />
        </div>
      </div>
    </section>
  );
}
