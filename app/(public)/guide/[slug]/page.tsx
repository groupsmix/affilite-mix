import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentSite } from "@/lib/site-context";
import { getSiteGuide, getAllSiteGuides } from "@/lib/site-guides";
import { getDialGuide } from "@/lib/dial-guides";
import { getDialHomepageConfig } from "@/lib/dial-config";
import { GuideArticle } from "../../components/article/guide-article";
import { HtmlRenderer } from "../../components/html-renderer";
import { JsonLd, organizationJsonLd, breadcrumbJsonLd, faqJsonLd } from "../../components/json-ld";
import { NewsletterSignup } from "../../components/newsletter-signup";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const site = await getCurrentSite();
  const dialGuide = getDialGuide(slug);
  if (dialGuide) {
    const url = `https://${site.domain}/guide/${dialGuide.slug}`;
    return {
      metadataBase: new URL(`https://${site.domain}`),
      title: dialGuide.meta.title,
      description: dialGuide.meta.description,
      alternates: { canonical: url },
      openGraph: {
        title: dialGuide.meta.title,
        description: dialGuide.meta.description,
        url,
        siteName: site.name,
        locale: site.locale,
        type: "article",
      },
    };
  }
  const guide = getSiteGuide(site.slug ?? site.id, slug);
  if (!guide) {
    return { title: "Not Found" };
  }
  const url = `https://${site.domain}/guide/${guide.slug}`;
  return {
    metadataBase: new URL(`https://${site.domain}`),
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: guide.metaTitle,
      description: guide.metaDescription,
      url,
      siteName: site.name,
      locale: site.locale,
      type: "article",
      publishedTime: guide.datePublished,
      modifiedTime: guide.dateModified,
    },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getCurrentSite();
  const dialGuide = getDialGuide(slug);
  if (dialGuide) {
    const dialConfig = await getDialHomepageConfig(site.id);
    return <GuideArticle guide={dialGuide} siteName={site.name} watches={dialConfig.watches} />;
  }

  const guide = getSiteGuide(site.slug ?? site.id, slug);
  if (!guide) notFound();

  const orgJsonLd = organizationJsonLd(site);
  const breadcrumbs = breadcrumbJsonLd(site, [
    { name: site.name, path: "/" },
    { name: "Guides", path: "/guide" },
    { name: guide.title, path: `/guide/${guide.slug}` },
  ]);

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: guide.title,
    description: guide.metaDescription,
    datePublished: guide.datePublished,
    dateModified: guide.dateModified,
    author: { "@type": "Organization", name: site.name },
    publisher: { "@type": "Organization", name: site.name, url: `https://${site.domain}` },
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://${site.domain}/guide/${guide.slug}` },
    inLanguage: site.language,
  };

  const faqJson = faqJsonLd(guide.bodyHtml);

  const allGuides = getAllSiteGuides(site.slug ?? site.id);
  const relatedGuides = allGuides
    .filter((g) => g.slug !== guide.slug && guide.relatedSlugs.includes(g.slug))
    .slice(0, 3);

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:py-12">
      <JsonLd data={breadcrumbs} />
      <JsonLd data={orgJsonLd} />
      <JsonLd data={articleJsonLd} />
      {faqJson && <JsonLd data={faqJson} />}

      <article>
        <header className="mb-8">
          <div className="text-sm font-medium uppercase tracking-wide text-gray-500">Guide</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            {guide.title}
          </h1>
          <p className="mt-4 text-lg text-gray-600">{guide.metaDescription}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4 text-sm text-gray-600">
            <span className="font-medium text-gray-900">{site.name} editorial team</span>
            <span aria-hidden="true">•</span>
            <Link href="/how-we-rank" className="hover:text-gray-900 hover:underline">
              How we test
            </Link>
            <span aria-hidden="true">•</span>
            <span>
              Last verified:{" "}
              <time dateTime={guide.dateModified}>
                {new Date(guide.dateModified).toLocaleDateString(
                  site.language === "ar" ? "ar-SA" : "en-US",
                  { year: "numeric", month: "short", day: "numeric" },
                )}
              </time>
            </span>
          </div>
        </header>

        <div className="mb-8 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {site.contentDisclosure}
        </div>

        <HtmlRenderer html={guide.bodyHtml} direction={site.direction} />

        {relatedGuides.length > 0 && (
          <section className="mt-12 border-t border-gray-100 pt-8">
            <h2 className="text-xl font-semibold text-gray-900">Related guides</h2>
            <ul className="mt-4 space-y-3">
              {relatedGuides.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/guide/${g.slug}`}
                    className="text-base font-medium hover:underline"
                    style={{ color: "var(--color-accent-text, var(--color-accent))" }}
                  >
                    {g.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-12 rounded-2xl border border-gray-200 bg-white p-6 sm:p-8">
          <h2 className="text-xl font-semibold text-gray-900">
            Get the latest {site.productLabelPlural.toLowerCase()} guides
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            A weekly roundup of new {site.productLabelPlural.toLowerCase()} buying guides, deals,
            and comparison updates.
          </p>
          <div className="mt-4 max-w-xl">
            <NewsletterSignup siteLanguage={site.language} />
          </div>
        </section>
      </article>
    </main>
  );
}
