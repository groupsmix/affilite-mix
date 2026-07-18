import Image from "next/image";
import Link from "next/link";
import type { ContentRow } from "@/types/database";
import { ScrollReveal } from "./showcase-ui";

interface EditorialProps {
  siteName: string;
  productLabelPlural: string;
  recentContent: ContentRow[];
  productCount: number;
  reviewCount: number;
}

export function Editorial({
  siteName,
  productLabelPlural,
  recentContent,
  productCount,
  reviewCount,
}: EditorialProps) {
  const journal = recentContent.slice(0, 3);

  return (
    <>
      <section id="about" className="w-full py-20 md:py-32 bg-card border-y border-border">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            <ScrollReveal>
              <div className="relative aspect-[4/5] overflow-hidden">
                <Image
                  src="/images/showcase/wrist-lifestyle.png"
                  alt="A luxury steel watch worn on the wrist"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
              </div>
            </ScrollReveal>

            <ScrollReveal delay={150}>
              <p className="text-xs uppercase tracking-[0.4em] text-primary mb-4">Why {siteName}</p>
              <h2 className="showcase-serif text-4xl md:text-5xl text-foreground leading-tight text-balance">
                We&apos;re the friend who <span className="italic">actually knows</span> watches
              </h2>
              <div className="mt-6 space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  The watch world is loud. Thousands of models, endless specs, and a lot of hype.{" "}
                  {siteName} cuts through it — we research movements, case sizes, lume, and value so
                  every pick on this page is one we&apos;d wear ourselves.
                </p>
                <p>
                  When you buy through our links, we may earn a commission from retailers like
                  Amazon at no extra cost to you. That&apos;s what keeps the lights on — and the
                  curation honest.
                </p>
              </div>

              <dl className="mt-10 grid grid-cols-3 gap-6">
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Curated {productLabelPlural.toLowerCase()}
                  </dt>
                  <dd className="mt-2 showcase-serif text-3xl text-primary">{productCount}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    In-depth reviews
                  </dt>
                  <dd className="mt-2 showcase-serif text-3xl text-primary">{reviewCount}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Sponsored picks
                  </dt>
                  <dd className="mt-2 showcase-serif text-3xl text-primary">Zero</dd>
                </div>
              </dl>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {journal.length > 0 && (
        <section id="journal" className="w-full py-20 md:py-28">
          <div className="container mx-auto px-4">
            <ScrollReveal className="text-center">
              <p className="text-xs uppercase tracking-[0.4em] text-primary mb-4">The Journal</p>
              <h2 className="showcase-serif text-4xl md:text-5xl text-foreground text-balance">
                Latest <span className="italic">reading</span>
              </h2>
            </ScrollReveal>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
              {journal.map((content, i) => (
                <ScrollReveal key={content.id} delay={i * 120}>
                  <Link
                    href={`/${content.type}/${content.slug}`}
                    className="group flex h-full flex-col border border-border bg-card transition-colors duration-300 hover:border-primary/50"
                  >
                    {content.featured_image && (
                      <div className="relative aspect-[16/10] overflow-hidden">
                        <Image
                          src={content.featured_image}
                          alt={content.title}
                          fill
                          className="object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-6">
                      <p className="text-[10px] uppercase tracking-[0.25em] text-primary">
                        {content.type}
                      </p>
                      <h3 className="mt-3 showcase-serif text-xl text-foreground text-balance">
                        {content.title}
                      </h3>
                      {content.excerpt && (
                        <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                          {content.excerpt}
                        </p>
                      )}
                      <span className="mt-auto pt-5 text-xs uppercase tracking-[0.2em] text-primary">
                        Read more
                      </span>
                    </div>
                  </Link>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
