import Image from "next/image";
import { Star } from "lucide-react";
import type { DialHomepageConfig } from "@/lib/dial-config";
import { Reveal } from "./reveal";

interface FeaturedReviewProps {
  config: DialHomepageConfig;
}

export function FeaturedReview({ config }: FeaturedReviewProps) {
  const review = config.featuredReview;
  if (!review) return null;

  return (
    <section id="featured-review" className="border-b border-border">
      <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
            Featured review
          </p>
        </Reveal>

        <div className="mt-10 grid items-center gap-10 md:grid-cols-2 md:gap-14">
          <Reveal>
            <div>
              <h2 className="text-balance font-serif text-4xl font-semibold leading-[1.05] tracking-tight text-foreground md:text-5xl">
                {review.title}
                <br />
                {review.subtitle}
              </h2>

              <div className="mt-5 flex items-center gap-3">
                <div className="flex" aria-label="Rated 5 out of 5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-500 text-amber-500" />
                  ))}
                </div>
                {review.editorsChoice && (
                  <span className="font-serif text-sm italic text-muted-foreground">
                    &middot; &nbsp;Editor&apos;s Choice
                  </span>
                )}
              </div>

              <p className="mt-5 max-w-md text-pretty leading-relaxed text-muted-foreground">
                {review.description}
              </p>

              <a
                href={review.href}
                className="group mt-7 inline-flex items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-[6px] transition-colors hover:text-primary"
              >
                Read the Full Review
                <span
                  aria-hidden
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                >
                  &rarr;
                </span>
              </a>
            </div>
          </Reveal>

          <Reveal delay={90}>
            <div className="relative aspect-[4/3] overflow-hidden bg-secondary/40">
              <Image
                src={review.image}
                alt={review.imageAlt}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
