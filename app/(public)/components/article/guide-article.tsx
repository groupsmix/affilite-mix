import Image from "next/image";
import { Reveal } from "./reveal";
import { DisclosureBanner } from "./disclosure-banner";
import { ArticleByline } from "./article-byline";
import { ArticleToc } from "./article-toc";
import { RankedPick } from "./ranked-pick";
import { BuyingGuide } from "./buying-guide";
import { ArticleFaq } from "./article-faq";
import Link from "next/link";
import { getDialGuidePicks, type DialGuide, type DialGuideAuthor } from "@/lib/dial-guides";
import type { Watch } from "@/lib/dial-config";
import { safeJsonLdString } from "@/lib/safe-json-ld";
import { cn } from "@/lib/utils";

export function GuideArticle({
  guide,
  author,
  updated,
  published,
  siteName = "WristNerd",
  watches,
}: {
  guide: DialGuide;
  author: DialGuideAuthor;
  updated: string;
  published: string;
  siteName?: string;
  watches?: Watch[];
}) {
  const picks = getDialGuidePicks(guide, watches);

  const toc = [
    ...picks.map((p) => ({ id: p.watch.id, label: `${p.award}: ${p.watch.name}` })),
    { id: "buying-guide", label: "How to choose" },
    { id: "faq", label: "FAQ" },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: guide.h1,
        datePublished: published,
        dateModified: published,
        author: { "@type": "Person", name: author.name, jobTitle: author.role },
        publisher: { "@type": "Organization", name: siteName },
      },
      {
        "@type": "ItemList",
        itemListElement: picks.map((p, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: `${p.watch.brand} ${p.watch.name}`,
        })),
      },
      {
        "@type": "FAQPage",
        mainEntity: guide.faqs.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  const hasHero = Boolean(guide.heroImage);

  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdString(jsonLd) }}
      />

      {hasHero && (
        <section className="relative h-[45vh] min-h-[360px] overflow-hidden md:h-[50vh] md:min-h-[440px]">
          <Image
            src={guide.heroImage!}
            alt={guide.heroImageAlt ?? guide.h1}
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

          <div className="relative z-10 flex h-full items-end px-4 pb-12 pt-16 sm:px-6 md:items-center md:pb-0 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">
              <nav aria-label="Breadcrumb" className="text-xs text-white/70">
                <ol className="flex items-center gap-2">
                  <li>
                    <Link href="/" className="transition-colors hover:text-white">
                      Home
                    </Link>
                  </li>
                  <li aria-hidden="true">/</li>
                  <li>
                    <Link href="/guide" className="transition-colors hover:text-white">
                      Guides
                    </Link>
                  </li>
                  <li aria-hidden="true">/</li>
                  <li className="text-white">{guide.breadcrumbLabel}</li>
                </ol>
              </nav>

              <p className="mt-4 text-sm font-medium uppercase tracking-widest text-[#2A9D8F]">
                {guide.eyebrow}
              </p>
              <h1 className="mt-3 max-w-3xl text-pretty font-serif text-4xl font-semibold leading-tight text-white md:text-5xl">
                {guide.h1}
              </h1>
              <p className="mt-4 max-w-2xl text-pretty text-lg leading-relaxed text-white/80">
                {guide.lede}
              </p>
            </div>
          </div>
        </section>
      )}

      <main
        className={cn(
          "mx-auto max-w-6xl px-4 pb-16 md:px-6",
          hasHero ? "pt-8 md:pt-12" : "pt-24 md:pt-28",
        )}
      >
        {!hasHero && (
          <>
            {/* Breadcrumb */}
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
              <ol className="flex items-center gap-2">
                <li>
                  <Link href="/" className="transition-colors hover:text-foreground">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li>
                  <Link href="/guide" className="transition-colors hover:text-foreground">
                    Guides
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li className="text-foreground">{guide.breadcrumbLabel}</li>
              </ol>
            </nav>

            {/* Article header */}
            <header className="mt-5 max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-widest text-primary">
                {guide.eyebrow}
              </p>
              <h1 className="mt-3 text-pretty font-serif text-4xl font-semibold leading-tight md:text-5xl">
                {guide.h1}
              </h1>
              <p className="mt-4 text-pretty text-lg leading-relaxed text-muted-foreground">
                {guide.lede}
              </p>
              <div className="mt-6">
                <ArticleByline author={author} updated={updated} />
              </div>
              <div className="mt-6">
                <DisclosureBanner />
              </div>
            </header>
          </>
        )}

        {hasHero && (
          <div className="mb-8 flex flex-col gap-4 border-b border-border pb-8 sm:flex-row sm:items-center sm:justify-between">
            <ArticleByline author={author} updated={updated} />
            <DisclosureBanner />
          </div>
        )}

        {/* Two-column body */}
        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_280px]">
          <div className="order-2 flex flex-col gap-8 lg:order-1">
            <Reveal className="rounded-xl border border-border bg-card/60 p-6">
              <p className="text-pretty leading-relaxed text-muted-foreground">
                {guide.introNote} Prices are approximate; tap{" "}
                <span className="font-medium text-foreground">Check price</span> for the current
                figure at the retailer.
              </p>
            </Reveal>

            {picks.map((p, i) => (
              <RankedPick
                key={p.watch.id}
                rank={i + 1}
                award={p.award}
                reason={p.reason}
                watch={p.watch}
              />
            ))}

            <BuyingGuide
              title={guide.buying.title}
              lede={guide.buying.lede}
              sections={guide.buying.sections}
            />
            <ArticleFaq faqs={guide.faqs} title={guide.faqTitle} />
          </div>

          {/* Sticky sidebar */}
          <aside className="order-1 lg:order-2">
            <div className="lg:sticky lg:top-24">
              <ArticleToc items={toc} />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
