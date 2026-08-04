import Image from "next/image";
import type { DialHomepageConfig } from "@/lib/dial-config";
import { Reveal } from "./reveal";

interface LatestReviewsProps {
  config: DialHomepageConfig;
}

export function LatestReviews({ config }: LatestReviewsProps) {
  const items = config.latestReviews ?? [];
  if (items.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
      <Reveal>
        <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
          Latest reviews
        </p>
      </Reveal>

      <div className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
        {items.map((item, i) => (
          <Reveal key={item.title} delay={i * 90}>
            <a href={item.href} className="group flex h-full flex-col">
              <div className="relative aspect-[4/3] overflow-hidden bg-secondary/40">
                <Image
                  src={item.image}
                  alt={item.imageAlt}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
              </div>

              <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {item.brand}
              </p>
              <h3 className="mt-2 font-serif text-2xl font-semibold tracking-tight text-foreground">
                {item.title}
              </h3>
              <p className="mt-2 text-pretty text-sm leading-relaxed text-muted-foreground">
                {item.description}
              </p>

              <div className="mt-auto flex items-center justify-between pt-4">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-[6px] transition-colors group-hover:text-primary">
                  Read Review
                  <span
                    aria-hidden
                    className="transition-transform duration-300 group-hover:translate-x-0.5"
                  >
                    &rarr;
                  </span>
                </span>
                <span className="text-sm text-muted-foreground">From ${item.price}</span>
              </div>
            </a>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
