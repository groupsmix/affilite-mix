import { Reveal } from "./reveal";
import { DisclosureBanner } from "./disclosure-banner";
import { ArticleByline } from "./article-byline";
import { ArticleToc } from "./article-toc";
import { RankedPick } from "./ranked-pick";
import { BuyingGuide } from "./buying-guide";
import { ArticleFaq } from "./article-faq";
import Link from "next/link";
import { author, getDialGuidePicks, type DialGuide } from "@/lib/dial-guides";
import type { Watch } from "@/lib/dial-config";
import { safeJsonLdString } from "@/lib/safe-json-ld";

const UPDATED = "July 2026";
const PUBLISHED = "2026-07-01";

export function GuideArticle({
  guide,
  siteName = "WristNerd",
  watches,
}: {
  guide: DialGuide;
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
        datePublished: PUBLISHED,
        dateModified: PUBLISHED,
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

  return (
    <div id="top" className="min-h-screen bg-background text-foreground">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLdString(jsonLd) }}
      />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-24 md:px-6 md:pt-28">
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
            <ArticleByline updated={UPDATED} />
          </div>
          <div className="mt-6">
            <DisclosureBanner />
          </div>
        </header>

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
            <ArticleFaq faqs={guide.faqs} />
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
